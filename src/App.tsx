import { ChangeEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
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
const FORCE_HAND_FALLBACK = new URLSearchParams(window.location.search).has('fallbackHand');

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

function HandFallbackSvg() {
  return (
    <svg
      className="hand-point-fallback"
      viewBox="0 0 65.28 121.21"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M64.86,121.21H26.29c-.02-1.01-.15-2.04-.08-3.06.07-1.17.21-1.44.09-2.69-.16-1.68.05-3.53-.72-5.06-1.16-2.29-2.16-3.92-3.8-5.88-1.79-2.14-2.38-4.71-3.44-7.22-.35-.82-.93-1.71-1.22-2.53-.38-1.07-.72-2.63-.97-3.75-.14-.64-.04-1.22-.12-1.83-.07-.55-.47-1.06-.54-1.57-.18-1.36.59-2.8-.65-3.9-.74-.66-2.7-.43-3.66-.9-.52-.25-.98-1-1.53-1.32-.47-.28-1.08-.38-1.57-.62-.7-.35-3.23-2.18-3.66-2.77-.96-1.31-2.45-3.65-2.97-5.17-.15-.44-.2-.93-.34-1.36-.28-.85-.8-1.3-.92-2.26-.22-1.84-.33-3.42.37-5.17.36-.91,1.13-1.57,1.1-2.56-.05-1.43-.39-2.4.1-3.89s2.29-3.25,3.75-3.65c.72-.2,1.37.13,1.93-.6.47-.61,1.69-3.15,1.99-3.95.71-1.86.34-3.31,1.71-4.88.36-.41,1.71-1.83,2.1-2.05.43-.25,2.27-.77,2.78-.8,1.63-.12,2.57.43,4.03.86,2.81.83,5.69,1.35,8.46,2.36,2.38.87,4.91,2.23,7.33,2.93,1.71.49,2.07.06,2.19-1.63.22-2.86-.73-4.64-.97-7.24-.18-1.86.09-3.35.17-5.12.07-1.58-.18-1.91-.8-3.2-.65-1.36-.87-3.1-1.3-4.56-.22-.74-.74-1.82-.88-2.53-.12-.59-.05-1.32-.12-1.91-.06-.47-.37-.98-.46-1.49-.22-1.27-.1-2.02-.69-3.29-.26-.56-.76-1.14-.99-1.69-.69-1.65-1.08-3.57-1.55-5.29-.37-1.37-.96-2.75-1.02-4.19-.05-1.2.5-3.4,1.3-4.31.62-.71,2.66-1.6,3.58-1.39.78.18,2.41.86,3.01,1.38,1.24,1.08.91,1.6,1.24,2.99.1.43.35.77.46,1.16.13.43.1,1.09.27,1.44s1.08,1.07,1.4,1.53c1.47,2.1,1.83,4.46,2.9,6.62.5,1.01,1.3,1.77,1.7,2.78.76,1.92.8,4.08,1.89,5.93.35.59.84,1.05,1.14,1.71s.27,1.39.54,1.98c.26.56,1.03,1.01,1.24,1.61.19.55.1,1.31.16,1.88.05.45.2.96.24,1.39.07.73-.17,1.57-.07,2.35.05.41.32.9.38,1.33.07.49.02.96.14,1.49.32,1.33.87,1.93,1.44,3.04.48.94,1.1,2.55,1.41,3.55.19.63.1,1.46.22,2.14s.41,1.68.6,2.33c.25.84.78,1.5,1.06,2.28.19.54.23,1.13.46,1.66.18.42.55.8.75,1.2.61,1.24.64,2.06.78,3.37.07.65.4,1.4.47,2.05.04.38-.07.71-.05,1.03.03.59.3,2.11.41,2.77.1.59.49,1.32.66,1.95.26.97.27,1.75.39,2.71.1.8.61,1.33.83,2.02.35,1.11.36,2.26.23,3.37-.08.66.17,1.45.16,2.11,0,.73-.35,1.64-.34,2.36.02.99.72,1.68.47,2.66-.07.29-.29.63-.37.93-.28,1.05-.08,3.65.26,4.69.13.41.41.8.53,1.18.39,1.22.26,2.93.45,4.27.07.47.26.92.3,1.41.09,1.1.06,3.2.62,4.18.07.13.22.2.3.36.29.59.08,1.42.15,2.04.08.65.44,1.47.54,2.23.11.84.07,1.66.2,2.49.11.72.38,1.44.52,2.17.27,1.34.27,2.55.51,3.89.17.96-.11,1.48-.07,2.26.03.55.45,1.21.5,1.71.05.63-.19.95-.25,1.47s-.04,1.56,0,2.12c.04.61.27,1.25.25,1.87s-.36,1.15-.41,1.75Z" />
    </svg>
  );
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
    const nextValue = event.target.value;

    if (/[-−]/.test(nextValue)) {
      setIsBceGuess(true);
    }

    setGuessInput(nextValue.replace(/\D/g, ''));
  }

  function handleGuessKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const isMinusKey = event.key === '-' || event.key === '−' || event.code === 'Minus' || event.code === 'NumpadSubtract';

    if (isMinusKey) {
      event.preventDefault();
      setIsBceGuess(true);
      return;
    }

    if (
      event.key === 'Backspace' &&
      isBceGuess &&
      event.currentTarget.selectionStart === 0 &&
      event.currentTarget.selectionEnd === 0
    ) {
      event.preventDefault();
      setIsBceGuess(false);
    }
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
                    onKeyDown={handleGuessKeyDown}
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
                        <span className={`hand-point hand-point-${directionHint.direction}`} aria-hidden="true">
                          <HandFallbackSvg />
                          {!FORCE_HAND_FALLBACK && (
                            <img
                              className="hand-point-image"
                              src={handPoint}
                              alt=""
                              onError={(event) => {
                                event.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                        </span>
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
