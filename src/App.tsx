import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import browerImage from './brower1.jpg';
import craesbeeckImage from './craesbeeck1.jpg';
import craesbeeckSmokerImage from './craesbeecksmoker1.jpg';
import handPoint from './hand6.png';
import objectIds from './objectids.json';
import plasterImage from './plaster1.jpg';

const MAX_ATTEMPTS = 6;
const VALUE_BOILING = 5;
const VALUE_HOT = 20;
const VALUE_CENTURIES_AWAY = 2;
const VALUE_DECADES_AWAY = 2;
const MET_API_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
const MAX_ARTWORK_LOAD_ATTEMPTS = 25;
const CURATED_OBJECT_IDS = objectIds as number[];

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

type MetObject = {
  objectID: number;
  primaryImage?: string | null;
  primaryImageSmall?: string | null;
  title: string;
  artistDisplayName: string;
  objectDate: string;
  objectBeginDate: number;
  objectEndDate: number;
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

function getGameOverSummary(finalGuess: Guess | undefined) {
  if (!finalGuess) return null;

  const distance = Math.abs(finalGuess.delta);

  if (distance === 0) {
    return {
      image: craesbeeckSmokerImage,
      imageAlt: 'Craesbeeck smoker',
      text: 'You win!',
    };
  }

  if (distance === 1) {
    return {
      image: craesbeeckImage,
      imageAlt: 'Craesbeeck portrait',
      text: 'Only 1 away!',
    };
  }

  if (distance < 200) {
    return {
      image: plasterImage,
      imageAlt: 'Plaster figure',
      text: `${distance} years away!`,
    };
  }

  return {
    image: browerImage,
    imageAlt: 'Brower painting',
    text: `${Math.round(distance / 100)} centuries off!`,
  };
}

function getSeededIndex(seed: number, offset: number, max: number) {
  return Math.floor((Math.abs(Math.sin(seed + offset * 9_973)) * 10_000) % max);
}

function getCandidateObjectIds(seed: number) {
  const ids = CURATED_OBJECT_IDS;
  const candidateCount = Math.min(MAX_ARTWORK_LOAD_ATTEMPTS, ids.length);
  const usedIndexes = new Set<number>();

  return Array.from({ length: candidateCount }, (_, attempt) => {
    let index = getSeededIndex(seed, attempt, ids.length);

    while (usedIndexes.has(index)) {
      index = (index + 1) % ids.length;
    }

    usedIndexes.add(index);
    return ids[index];
  });
}

function hasUsableArtworkData(object: MetObject) {
  return (
    Boolean(object.primaryImageSmall || object.primaryImage) &&
    Number.isInteger(object.objectBeginDate) &&
    object.objectBeginDate === object.objectEndDate
  );
}

function toArtwork(object: MetObject): Artwork {
  const imageUrl = object.primaryImageSmall || object.primaryImage;

  if (!imageUrl) {
    throw new Error('The selected MET object does not have an image.');
  }

  return {
    id: object.objectID,
    title: object.title || 'Untitled',
    artist: object.artistDisplayName || 'Unknown artist',
    year: object.objectBeginDate,
    dateLabel: object.objectDate || String(object.objectBeginDate),
    imageUrl,
    objectUrl: object.objectURL,
  };
}

function App() {
  const [guessInput, setGuessInput] = useState('');
  const [isBceGuess, setIsBceGuess] = useState(false);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [message, setMessage] = useState('');
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [isLoadingArtwork, setIsLoadingArtwork] = useState(true);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [artworkSeed, setArtworkSeed] = useState(() => Math.floor(Date.now() / 1000));
  const attemptListRef = useRef<HTMLOListElement | null>(null);

  const attemptsLeft = MAX_ATTEMPTS - guesses.length;
  const hasWon = guesses.some((guess) => guess.delta === 0);
  const hasEnded = hasWon || attemptsLeft === 0;
  const gameOverSummary = hasEnded ? getGameOverSummary(guesses[guesses.length - 1]) : null;

  const loadArtwork = useCallback(
    async (signal: AbortSignal, seed: number) => {
      setIsLoadingArtwork(true);
      setArtworkError(null);

      try {
        if (CURATED_OBJECT_IDS.length === 0) {
          throw new Error('No curated MET object IDs are available.');
        }

        let matchingObject: MetObject | undefined;

        for (const id of getCandidateObjectIds(seed)) {
          if (signal.aborted) return;

          try {
            const objectResponse = await fetch(`${MET_API_BASE}/objects/${id}`, { signal });

            if (!objectResponse.ok) {
              continue;
            }

            const object = (await objectResponse.json()) as MetObject;

            if (hasUsableArtworkData(object)) {
              matchingObject = object;
              break;
            }
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            if (error instanceof TypeError) throw error;
          }
        }

        if (!matchingObject) {
          throw new Error('No usable image was found from the curated MET object IDs.');
        }

        setArtwork(toArtwork(matchingObject));
        setGuesses([]);
        setGuessInput('');
        setIsBceGuess(false);
        setMessage('');
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
    const unsignedGuess = Number(trimmedGuess);
    const parsedGuess = isBceGuess ? -unsignedGuess : unsignedGuess;

    if (!/^\d+$/.test(trimmedGuess) || !Number.isInteger(unsignedGuess)) {
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
    setIsBceGuess(false);
    setArtwork(null);
    setMessage('Finding a new MET artwork...');
    setArtworkSeed((seed) => seed + 97);
  }

  function retryArtworkLoad() {
    setGuesses([]);
    setGuessInput('');
    setIsBceGuess(false);
    setArtwork(null);
    setMessage('Trying the MET again...');
    setArtworkSeed(Math.floor(Date.now() / 1000));
  }

  function updateGuessInput(event: ChangeEvent<HTMLInputElement>) {
    setGuessInput(event.target.value.replace(/\D/g, ''));
  }

  function handleArtworkImageError() {
    setArtwork(null);
    setMessage('That MET image was unavailable. Trying another artwork...');
    setArtworkSeed((seed) => seed + 1);
  }

  return (
    <main className="app-shell">
      <section className="game-panel" aria-labelledby="game-title">
        <header className="game-header">
          <p className="kicker">guess the year this art was made</p>
          <h1 id="game-title">WHEN ART THOU</h1>
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
            <img
              src={artwork.imageUrl}
              alt="Artwork from The Metropolitan Museum of Art"
              onError={handleArtworkImageError}
            />
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
          <form className="guess-form" onSubmit={submitGuess} autoComplete="off">
            <label htmlFor="year-guess">Year guess</label>
            <div className="input-row">
              <div className="year-entry-row">
                <div className={`year-input-shell ${!artwork ? 'year-input-shell-disabled' : ''}`}>
                  <input
                    className="year-input"
                    id="year-guess"
                    inputMode="numeric"
                    name="artthou-year-guess"
                    autoComplete="off"
                    pattern="[0-9]*"
                    onChange={updateGuessInput}
                    placeholder="e.g. 1889"
                    style={guessInput ? { width: `${guessInput.length + 0.5}ch` } : undefined}
                    type="text"
                    value={guessInput}
                    disabled={!artwork}
                  />
                  {guessInput && (
                    <span className="year-era-suffix" aria-hidden="true">
                      {isBceGuess ? 'BCE' : 'CE'}
                    </span>
                  )}
                </div>
                <button
                  className={`era-toggle ${isBceGuess ? 'era-toggle-active' : ''}`}
                  type="button"
                  aria-pressed={isBceGuess}
                  onClick={() => setIsBceGuess((isActive) => !isActive)}
                  disabled={!artwork}
                >
                  BCE
                </button>
              </div>
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

        {gameOverSummary ? (
          <div className="game-over-card" role="status" aria-live="polite">
            <div className="game-over-image-frame">
              <img src={gameOverSummary.image} alt={gameOverSummary.imageAlt} />
            </div>
            <div className="game-over-message">{gameOverSummary.text}</div>
          </div>
        ) : (
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
                    <span className="attempt-closeness" aria-label={closenessHint?.label}>
                      {closenessHint?.text}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}

export default App;
