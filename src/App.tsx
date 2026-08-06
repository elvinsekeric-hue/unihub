import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  filterActivity,
  loadDashboard,
  sortActivityByUrgency,
  type DashboardData,
} from './application/dashboard';
import {
  loadCourseView,
  type CourseViewData,
} from './application/courseView';
import {
  loadRecentSyncHistory,
} from './application/syncHistory';
import {
  importLatestIliasScan,
} from './application/syncLiveIliasScan';
import {
  buildFullSyncStartUrls,
} from './application/courseRegistry';
import {
  getAssignmentsDueThisWeek,
} from './application/weeklyOverview';
import {
  downloadIcsCalendar,
} from './application/icsExport';

import type {
  ActivityItem,
  Assignment,
  Course,
  Folder,
  SubmissionEvent,
} from './domain/models';
import type {
  StoredSyncSnapshot,
} from './infrastructure/sqlite/fileStore';

import { appRepository } from './infrastructure/repository';
import { relativeDate } from './shared/dates';
import { formatPointsValue } from './shared/points';
import { AssignmentCard } from './components/AssignmentCard';
import { CalendarView } from './components/CalendarView';
import './App.css';

type AppView =
  | 'dashboard'
  | 'courses'
  | 'course'
  | 'assignments'
  | 'week'
  | 'calendar';

const iconFor = (
  type: ActivityItem['type'],
): string => ({
  file: '📄',
  assignment: '⏳',
  announcement: '📢',
})[type];

async function safeOpen(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(
      url,
      '_blank',
      'noopener,noreferrer',
    );
  }
}

function getActivityDescription(
  item: ActivityItem,
): string | undefined {
  switch (item.type) {
    case 'file':
    case 'assignment':
      return item.description;

    case 'announcement':
      return item.body;
  }
}

function sameParent(
  folder: Folder,
  parentFolderId: string | undefined,
): boolean {
  return folder.parentFolderId === parentFolderId;
}

export default function App() {
  const [
    dashboard,
    setDashboard,
  ] = useState<DashboardData | null>(null);

  const [
    syncHistory,
    setSyncHistory,
  ] = useState<StoredSyncSnapshot[]>([]);

  const [
    courseView,
    setCourseView,
  ] = useState<CourseViewData | null>(null);

  const [view, setView] =
    useState<AppView>('dashboard');

  const [
  selectedCourse,
  setSelectedCourse,
] = useState('all');

const [
  assignmentStatus,
  setAssignmentStatus,
] = useState<
  'all' | Assignment['status']
>('all');

const [
  activeFolderId,
  setActiveFolderId,
] = useState<string | undefined>();

  const [query, setQuery] = useState('');

  const [
    noteDrafts,
    setNoteDrafts,
  ] = useState<Record<string, string>>({});

  const [
    submissionHistory,
    setSubmissionHistory,
  ] = useState<
    Record<string, SubmissionEvent[]>
  >({});

  const [
    expandedHistoryIds,
    setExpandedHistoryIds,
  ] = useState<Set<string>>(new Set());

  const [syncing, setSyncing] = useState(false);
  const [
  fullSyncing,
  setFullSyncing,
] = useState(false);
  const [loadingCourse, setLoadingCourse] =
    useState(false);

  const [lastSync, setLastSync] = useState(
    'Noch nicht synchronisiert',
  );

  async function refreshDashboard(): Promise<void> {
    const data = await loadDashboard(appRepository);
    setDashboard(data);
  }

  async function saveNote(
    assignment: Assignment,
  ): Promise<void> {
    const note = (
      noteDrafts[assignment.id] ?? ''
    ).trim();

    await appRepository.updateAssignmentNote(
      assignment.id,
      note,
    );

    setDashboard((previous) =>
      previous
        ? {
            ...previous,
            assignments:
              previous.assignments.map(
                (entry) =>
                  entry.id ===
                  assignment.id
                    ? {
                        ...entry,
                        userNote: note,
                      }
                    : entry,
              ),
          }
        : previous,
    );
  }

  async function toggleSubmissionHistory(
    assignmentId: string,
  ): Promise<void> {
    setExpandedHistoryIds((current) => {
      const next = new Set(current);

      if (next.has(assignmentId)) {
        next.delete(assignmentId);
      } else {
        next.add(assignmentId);
      }

      return next;
    });

    if (submissionHistory[assignmentId]) {
      return;
    }

    const events =
      await appRepository.getSubmissionEvents(
        assignmentId,
      );

    setSubmissionHistory((current) => ({
      ...current,
      [assignmentId]: events,
    }));
  }

  async function refreshSyncHistory(): Promise<void> {
    const history = await loadRecentSyncHistory(5);
    setSyncHistory(history);
  }

  async function refreshCurrentCourse():
  Promise<void> {
    if (!courseView) {
      return;
    }

    const data = await loadCourseView(
      appRepository,
      courseView.course,
    );

    setCourseView(data);
  }

  async function openCourse(
    course: Course,
  ): Promise<void> {
    setLoadingCourse(true);

    try {
      const data = await loadCourseView(
        appRepository,
        course,
      );

      setCourseView(data);
      setActiveFolderId(undefined);
      setView('course');
    } finally {
      setLoadingCourse(false);
    }
  }

  useEffect(() => {
    Promise.all([
      refreshDashboard(),
      refreshSyncHistory(),
    ]).catch((error) => {
      console.error(
        'UniHub konnte nicht vollständig geladen werden:',
        error,
      );
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    let removeListener:
      | (() => void)
      | undefined;

    async function registerListener():
    Promise<void> {
      removeListener = await listen(
        'unihub://ilias-scan-ready',
        async () => {
          try {
            setSyncing(true);

            const result =
              await importLatestIliasScan();

            if (!result || disposed) {
              return;
            }

            await Promise.all([
              refreshDashboard(),
              refreshSyncHistory(),
              refreshCurrentCourse(),
            ]);

            setLastSync(
              `Heute, ${new Date()
                .toLocaleTimeString('de-DE', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`,
            );

            console.log(
              `${result.courseId} / ` +
                `${result.scanSourceId} ` +
                'synchronisiert: ' +
                `${result.discovered} Dateien, ` +
                `${result.discoveredFolders} Ordner – ` +
                `${result.newFiles} Dateien neu, ` +
                `${result.changedFiles} geändert, ` +
                `${result.unchangedFiles} unverändert, ` +
                `${result.removedFiles} entfernt, ` +
                `${result.removedFolders} Ordner entfernt.`,
            );
          } catch (error) {
            console.error(
              'ILIAS-Scan konnte nicht verarbeitet werden:',
              error,
            );
          } finally {
            if (!disposed) {
              setSyncing(false);
            }
          }
        },
      );
    }

    registerListener().catch((error) => {
      console.error(
        'ILIAS-Listener konnte nicht gestartet werden:',
        error,
      );
    });

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [courseView]);

useEffect(() => {
  let removeCompleted:
    | (() => void)
    | undefined;

  let removeFailed:
    | (() => void)
    | undefined;

  async function registerFullSyncListeners():
  Promise<void> {
    removeCompleted = await listen(
      'unihub://full-sync-completed',
      async () => {
        setFullSyncing(false);

        await Promise.all([
          refreshDashboard(),
          refreshSyncHistory(),
          refreshCurrentCourse(),
        ]);

        setLastSync(
          `Heute, ${new Date()
            .toLocaleTimeString('de-DE', {
              hour: '2-digit',
              minute: '2-digit',
            })}`,
        );
      },
    );

    removeFailed = await listen<{
      errorMessage?: string;
    }>(
      'unihub://full-sync-failed',
      (event) => {
        setFullSyncing(false);

        const message =
          event.payload.errorMessage ??
          'Die Synchronisierung fehlgeschlagen.';

        setLastSync(`Fehler: ${message}`);

        console.error(
          'Vollständige Synchronisierung fehlgeschlagen:',
          event.payload.errorMessage,
        );
      },
    );
  }

  registerFullSyncListeners()
    .catch((error) => {
      console.error(
        'Full-Sync-Listener konnten nicht gestartet werden:',
        error,
      );
    });

  return () => {
    removeCompleted?.();
    removeFailed?.();
  };
}, [courseView]);

  const visibleItems = useMemo(
    () =>
      sortActivityByUrgency(
        filterActivity(
          dashboard?.activity ?? [],
          selectedCourse,
          query,
        ),
      ),
    [
      dashboard,
      query,
      selectedCourse,
    ],
  );

  const weeklyAssignments = useMemo(
    () =>
      getAssignmentsDueThisWeek(
        dashboard?.assignments ?? [],
      ),
    [dashboard],
  );

  const normalizedCourseQuery = query
    .trim()
    .toLocaleLowerCase('de-DE');

  const visibleCourses = useMemo(() => {
    const courses = dashboard?.courses ?? [];

    if (!normalizedCourseQuery) {
      return courses;
    }

    return courses.filter((course) =>
      `${course.title} ${course.shortName}`
        .toLocaleLowerCase('de-DE')
        .includes(normalizedCourseQuery),
    );
  }, [
    dashboard,
    normalizedCourseQuery,
  ]);

  const currentFolder =
    courseView?.folders.find(
      (folder) => folder.id === activeFolderId,
    );

  const visibleFolders =
    courseView?.folders.filter((folder) =>
      sameParent(folder, activeFolderId),
    ) ?? [];

  const visibleFiles =
    courseView?.files.filter((file) =>
      activeFolderId
        ? file.folderId === activeFolderId
        : !file.folderId
    ) ?? [];

  /*
   * Punktezusammenfassung: erreichte/maximale Punkte
   * aller Abgaben pro Modul.
   */
  const pointsByCourse = useMemo(() => {
    const result = new Map<
      string,
      { achieved: number; total: number }
    >();

    for (const assignment of
      dashboard?.assignments ?? []) {
      if (assignment.totalPoints === undefined) {
        continue;
      }

      const entry =
        result.get(assignment.courseId) ??
        { achieved: 0, total: 0 };

      entry.total += assignment.totalPoints;
      entry.achieved +=
        assignment.achievedPoints ?? 0;

      result.set(assignment.courseId, entry);
    }

    return result;
  }, [dashboard]);

const visibleAssignments = useMemo(
  () =>
    (dashboard?.assignments ?? [])
      .filter((assignment) => {
        const matchesCourse =
          selectedCourse === 'all' ||
          assignment.courseId ===
            selectedCourse;

        const matchesStatus =
          assignmentStatus === 'all' ||
          assignment.status ===
            assignmentStatus;

        const searchable =
          `${assignment.title} ` +
          `${assignment.description ?? ''}`;

        const matchesQuery =
          !query.trim() ||
          searchable
            .toLocaleLowerCase('de-DE')
            .includes(
              query
                .trim()
                .toLocaleLowerCase('de-DE'),
            );

        return (
          matchesCourse &&
          matchesStatus &&
          matchesQuery
        );
      })
      .sort((left, right) => {
        if (!left.dueAt) {
          return 1;
        }

        if (!right.dueAt) {
          return -1;
        }

        return left.dueAt.localeCompare(
          right.dueAt,
        );
      }),
  [
    dashboard,
    selectedCourse,
    assignmentStatus,
    query,
  ],
);

  /*
   * Pro Modul eine Punkte-Zusammenfassung, für die
   * aktuelle Kursfilter-Auswahl (oder alle Module
   * bei „Alle Kurse"). Muss vor dem frühen Return unten
   * stehen, sonst ändert sich die Hook-Reihenfolge
   * zwischen Lade- und geladenem Zustand.
   */
  const pointSummaries = useMemo(() => {
    const courses = dashboard?.courses ?? [];

    if (selectedCourse !== 'all') {
      const course = courses.find(
        (entry) => entry.id === selectedCourse,
      );

      const points =
        pointsByCourse.get(selectedCourse);

      return course && points
        ? [{ course, points }]
        : [];
    }

    return courses
      .map((course) => ({
        course,
        points: pointsByCourse.get(course.id),
      }))
      .filter(
        (
          entry,
        ): entry is {
          course: Course;
          points: {
            achieved: number;
            total: number;
          };
        } => entry.points !== undefined,
      );
  }, [
    selectedCourse,
    dashboard,
    pointsByCourse,
  ]);

  if (!dashboard) {
    return (
      <div className="app-loading">
        UniHub wird geladen …
      </div>
    );
  }

  const {
    courses,
    activity: items,
    assignments,
    semester,
  } = dashboard;

  function showDashboard(): void {
    setView('dashboard');
    setActiveFolderId(undefined);
  }

function showAssignments(): void {
  setView('assignments');
  setActiveFolderId(undefined);
}

function showWeek(): void {
  setView('week');
  setActiveFolderId(undefined);
}

function showCalendar(): void {
  setView('calendar');
  setActiveFolderId(undefined);
}

  function showCourses(): void {
    setView('courses');
    setActiveFolderId(undefined);
  }

  function goToParentFolder(): void {
    if (!currentFolder) {
      return;
    }

    setActiveFolderId(
      currentFolder.parentFolderId,
    );
  }

  async function syncNow(): Promise<void> {
    try {
      setFullSyncing(true);

      await invoke('start_full_sync', {
        courseUrls: buildFullSyncStartUrls(),
      });
    } catch (error) {
      setFullSyncing(false);

      console.error(
        'Vollständige Synchronisierung konnte nicht gestartet werden:',
        error,
      );
    }
  }

  return (

    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">U</div>

          <div>
            <strong>UniHub</strong>
            <span>
              Studium. Endlich übersichtlich.
            </span>
          </div>
        </div>

        <nav aria-label="Hauptnavigation">
          <button
            className={
              `nav-item ${
                view === 'dashboard'
                  ? 'active'
                  : ''
              }`
            }
            onClick={showDashboard}
          >
            ⌂ <span>Übersicht</span>
          </button>

<button
  className={
    `nav-item ${
      view === 'assignments'
        ? 'active'
        : ''
    }`
  }
  onClick={showAssignments}
>
  ✓ <span>Aufgaben</span>
</button>

<button
  className={
    `nav-item ${
      view === 'week' ? 'active' : ''
    }`
  }
  onClick={showWeek}
>
  📆 <span>Diese Woche</span>
</button>

<button
  className={
    `nav-item ${
      view === 'calendar' ? 'active' : ''
    }`
  }
  onClick={showCalendar}
>
  🗓 <span>Kalender</span>
</button>

          <button
            className={
              `nav-item ${
                view === 'courses' ||
                view === 'course'
                  ? 'active'
                  : ''
              }`
            }
            onClick={showCourses}
          >
            ▣ <span>Kurse</span>
          </button>

          <button className="nav-item">
            ⌕ <span>Dateien</span>
          </button>

          <button className="nav-item">
            ⚙ <span>Einstellungen</span>
          </button>
        </nav>

        <div className="semester-card">
          <span>Aktives Semester</span>
          <strong>{semester.name}</strong>
          <small>
            {courses.length} Kurse verbunden
          </small>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {view === 'dashboard'
                ? 'Montag, 20. Juli'
                : semester.name}
            </p>

            <h1>
              {view === 'assignments' &&
  'Abgaben, Fristen und Bearbeitungsstatus.'}
              {view === 'dashboard' &&
                'Guten Tag, Elvin.'}

              {view === 'week' &&
                'Diese Woche fällig'}

              {view === 'calendar' &&
                'Kalender'}

              {view === 'courses' &&
                'Meine Kurse'}

              {view === 'course' &&
                courseView?.course.title}
            </h1>

            <p className="subtitle">
              {view === 'dashboard' &&
                'Hier ist alles, was gerade wichtig ist.'}

              {view === 'week' &&
                'Alle offenen Abgaben mit Frist in den nächsten 7 Tagen, kursübergreifend.'}

              {view === 'calendar' &&
                'Alle Fristen im Monatsüberblick, farblich nach Kurs.'}

              {view === 'courses' &&
                'Alle verbundenen ILIAS-Kurse.'}

              {view === 'course' &&
                'Ordner und Dateien aus SQLite.'}
            </p>
          </div>

          <div className="top-actions">
            <label className="search">
              <span>⌕</span>

              <input
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder={
                  view === 'courses'
                    ? 'Kurse durchsuchen …'
                    : 'Kurse, Blätter, Dateien …'
                }
              />
            </label>

            {(view === 'assignments' ||
              view === 'week' ||
              view === 'calendar') && (
              <button
                className="secondary-button"
                onClick={() =>
                  downloadIcsCalendar(
                    dashboard.assignments,
                    dashboard.courses,
                  )
                }
              >
                ⤓ Als .ics exportieren
              </button>
            )}

            <button
              className="primary"
              onClick={syncNow}
              disabled={syncing || fullSyncing}
            >
              {syncing || fullSyncing
  ? 'Synchronisiere alle Kurse …'
  : '↻ Jetzt synchronisieren'}
            </button>
          </div>
        </header>

        {view === 'dashboard' && (
          <>
            <section
              className="metrics"
              aria-label="Zusammenfassung"
            >
              <article>
                <span>Neue Inhalte</span>
                <strong>
                  {
                    items.filter(
                      (item) => item.isNew,
                    ).length
                  }
                </strong>
                <small>
                  seit dem letzten Scan
                </small>
              </article>

              <article>
                <span>Offene Abgaben</span>
                <strong>
                  {
                    assignments.filter(
                      (item) =>
                        item.status !==
                          'submitted' &&
                        item.status !==
                          'graded',
                    ).length
                  }
                </strong>
                <small>Nächste in 3 Tagen</small>
              </article>

              <article>
                <span>Verbundene Kurse</span>
                <strong>{courses.length}</strong>
                <small>{lastSync}</small>
              </article>
            </section>

            <section className="workspace">
              <div className="main-column">
                <div className="section-heading">
                  <div>
                    <h2>Aktuelles</h2>
                    <p>
                      Neue Dateien, Änderungen und
                      Abgaben aus allen Kursen.
                    </p>
                  </div>

                  <select
                    value={selectedCourse}
                    onChange={(event) =>
                      setSelectedCourse(
                        event.target.value,
                      )
                    }
                    aria-label="Kurs filtern"
                  >
                    <option value="all">
                      Alle Kurse
                    </option>

                    {courses.map((course) => (
                      <option
                        key={course.id}
                        value={course.id}
                      >
                        {course.shortName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="feed">
                  {visibleItems.map((item) => {
                    const course = courses.find(
                      (entry) =>
                        entry.id === item.courseId,
                    );

                    return (
                      <button
                        className="feed-item"
                        key={item.id}
                        onClick={() =>
                          safeOpen(item.url)
                        }
                      >
                        <span className="item-icon">
                          {iconFor(item.type)}
                        </span>

                        <span className="item-body">
                          <span className="item-meta">
                            <b
                              style={{
                                color:
                                  course?.color,
                              }}
                            >
                              {course?.shortName ??
                                item.courseId}
                            </b>

                            {item.isNew && (
                              <em>NEU</em>
                            )}
                          </span>

                          <strong>
                            {item.title}
                          </strong>

                          {getActivityDescription(
                            item,
                          ) && (
                            <small>
                              {getActivityDescription(
                                item,
                              )}
                            </small>
                          )}

                          {item.type ===
                            'assignment' &&
                            item.dueAt && (
                              <small className="urgent">
                                Abgabe{' '}
                                {relativeDate(
                                  item.dueAt,
                                )}
                              </small>
                            )}

                          {item.type === 'file' &&
                            item.availableAt && (
                              <small>
                                Veröffentlicht am{' '}
                                {new Date(
                                  item.availableAt,
                                ).toLocaleDateString(
                                  'de-DE',
                                )}
                              </small>
                            )}
                        </span>

                        <span className="chevron">
                          ›
                        </span>
                      </button>
                    );
                  })}

                  {visibleItems.length === 0 && (
                    <div className="empty">
                      Keine passenden Inhalte
                      gefunden.
                    </div>
                  )}
                </div>
              </div>

              <aside className="right-column">
                <div className="section-heading">
                  <div>
                    <h2>Meine Kurse</h2>
                    <p>Direkter Zugriff</p>
                  </div>
                </div>

                <div className="course-list">
                  {courses.map((course) => (
                    <button
                      key={course.id}
                      className="course-card"
                      onClick={() =>
                        openCourse(course)
                      }
                    >
                      <span
                        className="course-badge"
                        style={{
                          background:
                            course.color,
                        }}
                      >
                        {course.shortName}
                      </span>

                      <span>
                        <strong>
                          {course.title}
                        </strong>
                        <small>
                          {semester.name}
                        </small>
                      </span>

                      <span>›</span>
                    </button>
                  ))}
                </div>

                <div className="status-card">
                  <div className="status-line">
                    <span className="pulse" />
                    <strong>
                      ILIAS-Verbindung bereit
                    </strong>
                  </div>

                  <p>
                    Live-Scans werden automatisch
                    verarbeitet und in SQLite
                    protokolliert.
                  </p>

                  <code>
                    Phase 3 · Live-Synchronisierung
                  </code>

                  <div className="sync-history">
                    <strong>
                      Letzte Synchronisierungen
                    </strong>

                    {syncHistory.length === 0 ? (
                      <small>
                        Noch keine Synchronisierung
                        gespeichert.
                      </small>
                    ) : (
                      syncHistory.map(
                        (snapshot) => (
                          <div
                            className={
                              'sync-history-item'
                            }
                            key={snapshot.id}
                          >
                            <span>
                              {snapshot.status ===
                              'success'
                                ? '✓'
                                : snapshot.status ===
                                    'partial'
                                  ? '!'
                                  : '×'}
                            </span>

                            <div>
                              <strong>
                                {new Date(
                                  snapshot.completedAt,
                                ).toLocaleString(
                                  'de-DE',
                                  {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute:
                                      '2-digit',
                                  },
                                )}
                              </strong>

                              <small>
                                {
                                  snapshot.discovered
                                }{' '}
                                gefunden ·{' '}
                                {snapshot.changed}{' '}
                                geändert ·{' '}
                                {snapshot.removed}{' '}
                                entfernt
                              </small>
                            </div>
                          </div>
                        ),
                      )
                    )}
                  </div>
                </div>
              </aside>
            </section>
          </>
        )}

        {view === 'courses' && (
          <section className="courses-page">
            <div className="courses-grid">
              {visibleCourses.map((course) => (
                <button
                  className="course-tile"
                  key={course.id}
                  onClick={() =>
                    openCourse(course)
                  }
                  disabled={loadingCourse}
                >
                  <span
                    className="course-badge large"
                    style={{
                      background: course.color,
                    }}
                  >
                    {course.shortName}
                  </span>

                  <span>
                    <strong>{course.title}</strong>
                    <small>{semester.name}</small>
                  </span>

                  <span className="chevron">
                    ›
                  </span>
                </button>
              ))}
            </div>

            {visibleCourses.length === 0 && (
              <div className="empty-panel">
                Keine passenden Kurse gefunden.
              </div>
            )}
          </section>
        )}

        {view === 'course' && courseView && (
          <section className="course-page">
            <div className="course-toolbar">
              <div>
                <button
                  className="secondary-button"
                  onClick={
                    currentFolder
                      ? goToParentFolder
                      : showCourses
                  }
                >
                  ←{' '}
                  {currentFolder
                    ? 'Zurück'
                    : 'Alle Kurse'}
                </button>

                <div className="breadcrumbs">
                  <button
                    onClick={() =>
                      setActiveFolderId(undefined)
                    }
                  >
                    {courseView.course.shortName}
                  </button>

                  {currentFolder?.path.map(
                    (part, index) => (
                      <span key={`${part}-${index}`}>
                        / {part}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <button
                className="secondary-button"
                onClick={() =>
                  safeOpen(
                    courseView.course.iliasUrl,
                  )
                }
              >
                In ILIAS öffnen ↗
              </button>
            </div>

            <div className="content-browser">
              {visibleFolders.map((folder) => (
                <button
                  className="browser-row"
                  key={folder.id}
                  onClick={() =>
                    setActiveFolderId(folder.id)
                  }
                >
                  <span className="browser-icon">
                    📁
                  </span>

                  <span className="browser-body">
                    <strong>{folder.title}</strong>
                    <small>Ordner</small>
                  </span>

                  <span className="chevron">
                    ›
                  </span>
                </button>
              ))}

              {visibleFiles.map((file) => (
                <button
                  className="browser-row"
                  key={file.id}
                  onClick={() =>
                    safeOpen(file.url)
                  }
                >
                  <span className="browser-icon">
                    📄
                  </span>

                  <span className="browser-body">
                    <strong>{file.title}</strong>

                    <small>
                      {file.mimeType ??
                        'Datei'}

                      {file.fileSizeBytes
                        ? ` · ${Math.round(
                            file.fileSizeBytes /
                              1024,
                          )} KB`
                        : ''}
                    </small>
                  </span>

                  <span className="chevron">
                    ↗
                  </span>
                </button>
              ))}

              {visibleFolders.length === 0 &&
                visibleFiles.length === 0 && (
                  <div className="empty-panel">
                    <strong>
                      Noch keine Inhalte
                      synchronisiert.
                    </strong>

                    <p>
                      Öffne den gewünschten
                      ILIAS-Ordner und scanne ihn
                      mit der UniHub-Erweiterung.
                    </p>
                  </div>
                )}
            </div>
          </section>
        )}
        {view === 'assignments' && (
  <section className="assignments-page">
    {pointSummaries.length > 0 && (
      <div className="points-summary">
        {pointSummaries.map(
          ({ course, points }) => (
            <article
              className="points-card"
              key={course.id}
            >
              <span
                className="course-badge"
                style={{
                  background:
                    course.color ?? '#315a82',
                }}
              >
                {course.shortName ?? '?'}
              </span>

              <span className="points-body">
                <strong>Punkte</strong>
                <em>
                  {formatPointsValue(
                    points.achieved,
                  )}{' '}
                  /{' '}
                  {formatPointsValue(
                    points.total,
                  )}
                </em>
              </span>
            </article>
          ),
        )}
      </div>
    )}

    <div className="assignment-filters">
      <select
        value={selectedCourse}
        onChange={(event) =>
          setSelectedCourse(
            event.target.value,
          )
        }
      >
        <option value="all">
          Alle Kurse
        </option>

        {courses.map((course) => (
          <option
            key={course.id}
            value={course.id}
          >
            {course.shortName}
          </option>
        ))}
      </select>

      <select
        value={assignmentStatus}
        onChange={(event) =>
          setAssignmentStatus(
            event.target.value as
              | 'all'
              | Assignment['status'],
          )
        }
      >
        <option value="all">
          Alle Status
        </option>
        <option value="not-started">
          Nicht begonnen
        </option>
        <option value="in-progress">
          In Bearbeitung
        </option>
        <option value="submitted">
          Abgegeben
        </option>
        <option value="graded">
          Bewertet
        </option>
      </select>
    </div>

    <div className="assignment-list">
      {visibleAssignments.map((assignment) => (
        <AssignmentCard
          key={assignment.id}
          assignment={assignment}
          course={courses.find(
            (entry) =>
              entry.id === assignment.courseId,
          )}
          noteDraft={noteDrafts[assignment.id]}
          onNoteChange={(value) =>
            setNoteDrafts((drafts) => ({
              ...drafts,
              [assignment.id]: value,
            }))
          }
          onSaveNote={() => saveNote(assignment)}
          isHistoryExpanded={expandedHistoryIds.has(
            assignment.id,
          )}
          historyEvents={
            submissionHistory[assignment.id]
          }
          onToggleHistory={() =>
            toggleSubmissionHistory(assignment.id)
          }
          onOpen={safeOpen}
        />
      ))}

      {visibleAssignments.length === 0 && (
        <div className="empty-panel">
          <strong>
            Keine Abgaben gefunden.
          </strong>

          <p>
            Starte einen vollständigen
            Kursscan, damit UniHub die
            Übungs- und Abgabeseiten
            einliest.
          </p>
        </div>
      )}
    </div>
  </section>
)}

{view === 'week' && (
  <section className="assignments-page">
    <div className="assignment-list">
      {weeklyAssignments.map((assignment) => (
        <AssignmentCard
          key={assignment.id}
          assignment={assignment}
          course={courses.find(
            (entry) =>
              entry.id === assignment.courseId,
          )}
          noteDraft={noteDrafts[assignment.id]}
          onNoteChange={(value) =>
            setNoteDrafts((drafts) => ({
              ...drafts,
              [assignment.id]: value,
            }))
          }
          onSaveNote={() => saveNote(assignment)}
          isHistoryExpanded={expandedHistoryIds.has(
            assignment.id,
          )}
          historyEvents={
            submissionHistory[assignment.id]
          }
          onToggleHistory={() =>
            toggleSubmissionHistory(assignment.id)
          }
          onOpen={safeOpen}
        />
      ))}

      {weeklyAssignments.length === 0 && (
        <div className="empty-panel">
          <strong>
            Diese Woche liegt nichts an.
          </strong>

          <p>
            Keine offenen Abgaben mit Frist in
            den nächsten 7 Tagen.
          </p>
        </div>
      )}
    </div>
  </section>
)}

{view === 'calendar' && (
  <section className="assignments-page">
    <CalendarView
      assignments={assignments}
      courses={courses}
      onOpen={safeOpen}
    />
  </section>
)}
      </main>
    </div>
  );
}