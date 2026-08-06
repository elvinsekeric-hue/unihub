import {
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  SearchResult,
  SearchResultType,
} from '../domain/models';

const TYPE_ICONS: Record<SearchResultType, string> = {
  file: '📄',
  folder: '📁',
  assignment: '⏳',
};

const TYPE_LABELS: Record<SearchResultType, string> = {
  file: 'Datei',
  folder: 'Ordner',
  assignment: 'Abgabe',
};

export interface CommandPaletteProps {
  onClose: () => void;
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelect: (result: SearchResult) => void;
}

export function CommandPalette({
  onClose,
  onSearch,
  onSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>(
    [],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const trimmed = query.trim();

    if (!trimmed) {
      setResults([]);
      setActiveIndex(0);
      return;
    }

    const timeout = window.setTimeout(() => {
      onSearch(trimmed)
        .then((found) => {
          if (!cancelled) {
            setResults(found);
            setActiveIndex(0);
          }
        })
        .catch((error) => {
          console.error(
            'Suche fehlgeschlagen:',
            error,
          );
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, onSearch]);

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === 'Escape') {
      onClose();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) =>
        Math.min(index + 1, results.length - 1),
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter' && results[activeIndex]) {
      onSelect(results[activeIndex]);
    }
  }

  return (
    <div
      className="command-palette-overlay"
      onClick={onClose}
    >
      <div
        className="command-palette"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="command-palette-input"
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
          onKeyDown={handleKeyDown}
          placeholder="Kurse, Blätter, Aufgaben, Ordner durchsuchen …"
        />

        <div className="command-palette-results">
          {results.map((result, index) => (
            <button
              key={`${result.type}:${result.id}`}
              className={
                'command-palette-result' +
                (index === activeIndex
                  ? ' command-palette-result-active'
                  : '')
              }
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onSelect(result)}
            >
              <span>{TYPE_ICONS[result.type]}</span>

              <span className="command-palette-result-body">
                <strong>{result.title}</strong>
                <small>{TYPE_LABELS[result.type]}</small>
              </span>
            </button>
          ))}

          {query.trim() && results.length === 0 && (
            <div className="command-palette-empty">
              Keine Treffer für „{query.trim()}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
