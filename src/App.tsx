import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const MAX_ATTEMPTS = 8;
const VALUE_BOILING = 5;
const VALUE_HOT = 19;
const VALUE_CENTURIES_AWAY = 2;
const VALUE_DECADES_AWAY = 2;
const MET_API_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
const SEARCH_TERMS = ['painting', 'landscape', 'flowers', 'vase', 'interior', 'ship', 'bird', 'garden', 'still life'];
const BLOCKED_TERMS = [
  'nude',
  'nudity',
  'naked',
  'bather',
  'bathers',
  'bathsheba',
  'venus',
  'odalisque',
];

type Guess = {
  value: number;
  delta: number;
};

type Artwork = {
  id: number;
  title: string;
  artist: string;
  year: number;
  dateLabel: string;
  imageUrl: string | null;
  objectUrl: string;
};

type MetSearchResponse = {
  objectIDs: number[] | null;
};

type MetObject = {
  objectID: number;
  isPublicDomain: boolean;
  primaryImage: string;
  primaryImageSmall: string;
  title: string;
  artistDisplayName: string;
  objectDate: string;
  objectBeginDate: number;
  objectEndDate: number;
  objectName: string;
  classification: string;
  medium: string;
  tags?: { term: string }[] | null;
  objectURL: string;
};

function getYearBucket(year: number, bucketSize: number) {
  return Math.floor(year / bucketSize);
}

function isSameMillennium(firstYear: number, secondYear: number) {
  return getYearBucket(firstYear, 1000) === getYearBucket(secondYear, 1000);
}

function isSameCentury(firstYear: number, secondYear: number) {
  return getYearBucket(firstYear, 100) === getYearBucket(secondYear, 100);
}

function getCenturyDistance(firstYear: number, secondYear: number) {
  return Math.abs(getYearBucket(firstYear, 100) - getYearBucket(secondYear, 100));
}

function getDecadeDistance(firstYear: number, secondYear: number) {
  return Math.abs(getYearBucket(firstYear, 10) - getYearBucket(secondYear, 10));
}

function getFeedback(guessYear: number, answerYear: number) {
  const delta = answerYear - guessYear;
  const distance = Math.abs(delta);

  if (delta === 0) return 'Correct';
  if (distance <= VALUE_BOILING) return 'Boiling';
  if (!isSameMillennium(guessYear, answerYear)) return 'Wrong millennium';
  if (!isSameCentury(guessYear, answerYear)) {
    return getCenturyDistance(guessYear, answerYear) > VALUE_CENTURIES_AWAY
      ? 'Centuries away'
      : 'Wrong century';
  }
  if (getDecadeDistance(guessYear, answerYear) > VALUE_DECADES_AWAY || distance > VALUE_HOT) return 'Decades away';
  return 'Hot';
}

function getDirectionEmoji(delta: number) {
  if (delta === 0) return { emoji: '🎉', label: 'Correct' };
  return delta > 0
    ? { emoji: '⬆️', label: 'Answer is higher' }
    : { emoji: '⬇️', label: 'Answer is lower' };
}

function getClosenessEmoji(guessYear: number, answerYear: number) {
  const delta = answerYear - guessYear;
  const distance = Math.abs(delta);

  if (distance === 0) return { text: 'Winner!🥇', label: 'Won' };
  if (distance <= VALUE_BOILING) return { text: 'Boiling!🔥', label: 'Boiling' };
  if (!isSameMillennium(guessYear, answerYear)) {
    return { text: 'Wrong millennium. 🧊', label: 'Wrong millennium' };
  }
  if (!isSameCentury(guessYear, answerYear)) {
    return getCenturyDistance(guessYear, answerYear) > VALUE_CENTURIES_AWAY
      ? { text: 'Centuries away. 🧊', label: 'Centuries away' }
      : { text: 'Wrong century. 🤔', label: 'Wrong century' };
  }
  if (getDecadeDistance(guessYear, answerYear) > VALUE_DECADES_AWAY || distance > VALUE_HOT) {
    return { text: 'Decades away. 🤔', label: 'Decades away' };
  }
  return { text: 'Hot. 😅', label: 'Hot' };
}

function getSearchTerm(seed: number) {
  return SEARCH_TERMS[Math.abs(seed) % SEARCH_TERMS.length];
}

function seededIndex(seed: number, max: number) {
  return Math.abs(Math.sin(seed) * 10_000) % max;
}

function includesBlockedTerms(object: MetObject) {
  const tagTerms = object.tags?.map((tag) => tag.term).join(' ') ?? '';
  const searchableText = [
    object.title,
    object.objectName,
    object.classification,
    object.medium,
    tagTerms,
  ]
    .join(' ')
    .toLowerCase();

  return BLOCKED_TERMS.some((term) => searchableText.includes(term));
}

function isSingleYearPublicDomainImage(object: MetObject) {
  return (
    object.isPublicDomain &&
    Boolean(object.primaryImage || object.primaryImageSmall) &&
    Number.isInteger(object.objectBeginDate) &&
    object.objectBeginDate === object.objectEndDate &&
    !includesBlockedTerms(object)
  );
}

function toArtwork(object: MetObject): Artwork {
  return {
    id: object.objectID,
    title: object.title || 'Untitled',
    artist: object.artistDisplayName || 'Unknown artist',
    year: object.objectBeginDate,
    dateLabel: object.objectDate || String(object.objectBeginDate),
    imageUrl: object.primaryImageSmall || object.primaryImage,
    objectUrl: object.objectURL,
  };
}

function App() {
  const [guessInput, setGuessInput] = useState('');
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [message, setMessage] = useState('Guess the year this piece is dated to.');
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [isLoadingArtwork, setIsLoadingArtwork] = useState(true);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [artworkSeed, setArtworkSeed] = useState(() => Math.floor(Date.now() / 1000));

  const attemptsLeft = MAX_ATTEMPTS - guesses.length;
  const hasWon = guesses.some((guess) => guess.delta === 0);
  const hasEnded = hasWon || attemptsLeft === 0;

  const attemptSlots = useMemo(
    () => Array.from({ length: MAX_ATTEMPTS }, (_, index) => guesses[index]),
    [guesses],
  );

  const loadArtwork = useCallback(
    async (signal: AbortSignal, seed: number) => {
      setIsLoadingArtwork(true);
      setArtworkError(null);

      try {
        const searchTerm = getSearchTerm(seed);
        const searchUrl = `${MET_API_BASE}/search?hasImages=true&q=${encodeURIComponent(searchTerm)}`;
        const searchResponse = await fetch(searchUrl, { signal });

        if (!searchResponse.ok) {
          throw new Error('The MET search request failed.');
        }

        const searchData = (await searchResponse.json()) as MetSearchResponse;
        const objectIDs = searchData.objectIDs ?? [];

        if (objectIDs.length === 0) {
          throw new Error('No MET objects matched today.');
        }

        const startIndex = Math.floor(seededIndex(seed, objectIDs.length));
        const candidateIDs = [...objectIDs.slice(startIndex), ...objectIDs.slice(0, startIndex)].slice(0, 60);
        let matchingObject: MetObject | undefined;

        for (const id of candidateIDs) {
          if (signal.aborted) return;

          try {
            const objectResponse = await fetch(`${MET_API_BASE}/objects/${id}`, { signal });

            if (!objectResponse.ok) {
              continue;
            }

            const object = (await objectResponse.json()) as MetObject;

            if (isSingleYearPublicDomainImage(object)) {
              matchingObject = object;
              break;
            }
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
          }
        }

        if (!matchingObject) {
          throw new Error('No image with a single public-domain year was found.');
        }

        setArtwork(toArtwork(matchingObject));
        setGuesses([]);
        setGuessInput('');
        setMessage('Guess the year this piece is dated to.');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setArtworkError(
          error instanceof TypeError
            ? 'Could not reach the MET API. Try reloading the artwork.'
            : error instanceof Error
              ? error.message
              : 'Unable to load artwork.',
        );
      } finally {
        if (!signal.aborted) {
          setIsLoadingArtwork(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadArtwork(controller.signal, artworkSeed);

    return () => controller.abort();
  }, [artworkSeed, loadArtwork]);

  function submitGuess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (hasEnded || !artwork) return;

    const trimmedGuess = guessInput.trim();
    const parsedGuess = Number(trimmedGuess);

    if (!/^-?\d+$/.test(trimmedGuess) || !Number.isInteger(parsedGuess)) {
      setMessage('Enter a whole year.');
      return;
    }

    if (parsedGuess < -4000 || parsedGuess > new Date().getFullYear()) {
      setMessage('Try a year between 4000 BCE and today.');
      return;
    }

    const nextGuess = {
      value: parsedGuess,
      delta: artwork.year - parsedGuess,
    };
    const nextGuesses = [...guesses, nextGuess];
    const won = nextGuess.delta === 0;
    const outOfAttempts = nextGuesses.length === MAX_ATTEMPTS;

    setGuesses(nextGuesses);
    setGuessInput('');

    if (won) {
      setMessage(`You got it. The piece is dated to ${artwork.year}.`);
    } else if (outOfAttempts) {
      setMessage(`Round over. The piece is dated to ${artwork.year}.`);
    } else {
      setMessage(
        `${getFeedback(nextGuess.value, artwork.year)}. The answer is ${nextGuess.delta > 0 ? 'higher' : 'lower'}.`,
      );
    }
  }

  function requestNewArtwork() {
    setGuesses([]);
    setGuessInput('');
    setArtwork(null);
    setMessage('Finding a new MET artwork...');
    setArtworkSeed((seed) => seed + 97);
  }

  function retryArtworkLoad() {
    setGuesses([]);
    setGuessInput('');
    setArtwork(null);
    setMessage('Trying the MET again...');
    setArtworkSeed(Math.floor(Date.now() / 1000));
  }

  return (
    <main className="app-shell">
      <section className="game-panel" aria-labelledby="game-title">
        <header className="game-header">
          <p className="kicker">Daily collection game</p>
          <h1 id="game-title">Erelong</h1>
        </header>

        <div className="art-stage" aria-label="Artwork display area">
          {isLoadingArtwork ? (
            <div className="image-placeholder">
              <span>Loading MET artwork</span>
            </div>
          ) : artworkError ? (
            <div className="image-placeholder">
              <span>{artworkError}</span>
              <button type="button" onClick={retryArtworkLoad}>
                Reload artwork
              </button>
            </div>
          ) : artwork?.imageUrl ? (
            <img src={artwork.imageUrl} alt="Artwork from The Metropolitan Museum of Art" />
          ) : (
            <div className="image-placeholder">
              <span>MET artwork image</span>
            </div>
          )}
        </div>

        <form className="guess-form" onSubmit={submitGuess}>
          <label htmlFor="year-guess">Year guess</label>
          <div className="input-row">
            <input
              id="year-guess"
              inputMode="numeric"
              name="year-guess"
              pattern="-?[0-9]*"
              onChange={(event) => setGuessInput(event.target.value)}
              placeholder="e.g. 1889"
              type="text"
              value={guessInput}
              disabled={hasEnded || !artwork}
            />
            <button type="submit" disabled={hasEnded || !artwork}>
              Guess
            </button>
          </div>
        </form>

        <div className="status-row" role="status" aria-live="polite">
          <span>{message}</span>
          <strong>{attemptsLeft} left</strong>
        </div>

        <ol className="attempt-list" aria-label="Guess attempts">
          {attemptSlots.map((guess, index) => (
            <li className={guess ? 'attempt filled' : 'attempt'} key={index}>
              {guess ? (
                <div className="attempt-grid">
                  <span className="attempt-value">{guess.value}</span>
                  <span className="attempt-separator" aria-hidden="true">
                    |
                  </span>
                  <span className="attempt-emoji" aria-label={getDirectionEmoji(guess.delta).label}>
                    {getDirectionEmoji(guess.delta).emoji}
                  </span>
                  <span className="attempt-separator" aria-hidden="true">
                    |
                  </span>
                  <span
                    className="attempt-closeness"
                    aria-label={getClosenessEmoji(guess.value, guess.value + guess.delta).label}
                  >
                    {getClosenessEmoji(guess.value, guess.value + guess.delta).text}
                  </span>
                </div>
              ) : (
                <span>Chance {index + 1}</span>
              )}
            </li>
          ))}
        </ol>

        {hasEnded && (
          <div className="result-card">
            <p>
              {artwork?.title} by {artwork?.artist}. Dated {artwork?.dateLabel}.
            </p>
            {artwork?.objectUrl && (
              <a href={artwork.objectUrl} target="_blank" rel="noreferrer">
                View at The MET
              </a>
            )}
            <button type="button" onClick={requestNewArtwork}>
              Play again
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
