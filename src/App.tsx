import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import handPoint from './hand6.png';

const MAX_ATTEMPTS = 6;
const VALUE_BOILING = 5;
const VALUE_HOT = 20;
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

function getTemperatureHint(guessYear: number, answerYear: number, previousGuessYear?: number) {
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
  if (previousGuessYear === undefined) return 'Hot';

  return distance < Math.abs(answerYear - previousGuessYear) ? 'Warmer' : 'Cooler';
}

function getDirectionHint(delta: number) {
  if (delta === 0) return { label: 'Correct', direction: 'correct' };
  return delta > 0
    ? { label: 'Answer is higher', direction: 'up' }
    : { label: 'Answer is lower', direction: 'down' };
}

function getClosenessEmoji(guessYear: number, answerYear: number, previousGuessYear?: number) {
  const hint = getTemperatureHint(guessYear, answerYear, previousGuessYear);

  switch (hint) {
    case 'Correct':
      return { text: 'Winner!🥇', label: 'Won' };
    case 'Boiling':
      return { text: 'Boiling!🔥', label: 'Boiling' };
    case 'Wrong millennium':
      return { text: 'Wrong millennium.', label: 'Wrong millennium' };
    case 'Centuries away':
      return { text: 'Centuries away.', label: 'Centuries away' };
    case 'Wrong century':
      return { text: 'Wrong century.', label: 'Wrong century' };
    case 'Decades away':
      return { text: 'Decades away.', label: 'Decades away' };
    case 'Warmer':
      return { text: 'Warmer. 🔥', label: 'Warmer' };
    case 'Cooler':
      return { text: 'Cooler. 🧊', label: 'Cooler' };
    default:
      return { text: 'Hot. 😅', label: 'Hot' };
  }
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
  const attemptListRef = useRef<HTMLOListElement | null>(null);

  const attemptsLeft = MAX_ATTEMPTS - guesses.length;
  const hasWon = guesses.some((guess) => guess.delta === 0);
  const hasEnded = hasWon || attemptsLeft === 0;

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

  useEffect(() => {
    if (!attemptListRef.current) return;

    attemptListRef.current.scrollTop = attemptListRef.current.scrollHeight;
  }, [guesses.length]);

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
    const previousGuess = guesses[guesses.length - 1];
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
        `${getTemperatureHint(nextGuess.value, artwork.year, previousGuess?.value)}. The answer is ${
          nextGuess.delta > 0 ? 'higher' : 'lower'
        }.`,
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
          <h1 id="game-title">artthou.</h1>
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

        {hasEnded ? (
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
        ) : (
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
                disabled={!artwork}
              />
              <button type="submit" disabled={!artwork}>
                Guess
              </button>
            </div>
          </form>
        )}

        <div className="status-row" role="status" aria-live="polite">
          <span>{message}</span>
          <strong>{attemptsLeft} left</strong>
        </div>

        <ol className="attempt-list" aria-label="Guess attempts" ref={attemptListRef}>
          {guesses.map((guess, index) => {
            const previousGuess = index > 0 ? guesses[index - 1] : undefined;
            const answerYear = guess.value + guess.delta;
            const closenessHint = getClosenessEmoji(guess.value, answerYear, previousGuess?.value);
            const directionHint = getDirectionHint(guess.delta);

            return (
            <li className="attempt filled" key={`${guess.value}-${index}`}>
                <div className="attempt-grid">
                  <span className="attempt-value">{guess.value}</span>
                  <span className="attempt-direction" aria-label={directionHint.label}>
                    {directionHint.direction === 'correct' ? (
                      '🎉'
                    ) : (
                      <img
                        className={`hand-point hand-point-${directionHint.direction}`}
                        src={handPoint}
                        alt=""
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span
                    className="attempt-closeness"
                    aria-label={closenessHint?.label}
                  >
                    {closenessHint?.text}
                  </span>
                </div>
            </li>
          );
          })}
        </ol>
      </section>
    </main>
  );
}

export default App;
