import { useEffect, useMemo, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import './App.css';
import { filterActivity, loadDashboard, type DashboardData } from './application/dashboard';
import type { ActivityItem } from './domain/models';
import { mockRepository } from './infrastructure/mock/mockRepository';
import { relativeDate } from './shared/dates';

const iconFor = (type: ActivityItem['type']) => ({
  file: '📄',
  assignment: '⏳',
  announcement: '📢',
}[type]);

async function safeOpen(url: string) {
  try {
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState('Noch nicht synchronisiert');

  useEffect(() => {
    loadDashboard(mockRepository).then(setDashboard);
  }, []);

  const visibleItems = useMemo(
    () => filterActivity(dashboard?.activity ?? [], selectedCourse, query),
    [dashboard, query, selectedCourse],
  );

  if (!dashboard) {
    return <div className="app-loading">UniHub wird geladen …</div>;
  }

  const { courses, activity: items, assignments, semester } = dashboard;

  async function syncNow() {
    setSyncing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 850));
    setLastSync(`Heute, ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`);
    setSyncing(false);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">U</div>
          <div><strong>UniHub</strong><span>Studium. Endlich übersichtlich.</span></div>
        </div>

        <nav aria-label="Hauptnavigation">
          <button className="nav-item active">⌂ <span>Übersicht</span></button>
          <button className="nav-item">▣ <span>Kurse</span></button>
          <button className="nav-item">✓ <span>Aufgaben</span></button>
          <button className="nav-item">⌕ <span>Dateien</span></button>
          <button className="nav-item">⚙ <span>Einstellungen</span></button>
        </nav>

        <div className="semester-card">
          <span>Aktives Semester</span>
          <strong>{semester.name}</strong>
          <small>{courses.length} Kurse verbunden</small>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Montag, 20. Juli</p>
            <h1>Guten Tag, Elvin.</h1>
            <p className="subtitle">Hier ist alles, was gerade wichtig ist.</p>
          </div>
          <div className="top-actions">
            <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Kurse, Blätter, Dateien …" /></label>
            <button className="primary" onClick={syncNow} disabled={syncing}>{syncing ? 'Synchronisiere …' : '↻ Jetzt synchronisieren'}</button>
          </div>
        </header>

        <section className="metrics" aria-label="Zusammenfassung">
          <article><span>Neue Inhalte</span><strong>{items.filter((item) => item.isNew).length}</strong><small>seit dem letzten Scan</small></article>
          <article><span>Offene Abgaben</span><strong>{assignments.filter((item) => item.status !== 'submitted' && item.status !== 'graded').length}</strong><small>Nächste in 3 Tagen</small></article>
          <article><span>Verbundene Kurse</span><strong>{courses.length}</strong><small>{lastSync}</small></article>
        </section>

        <section className="workspace">
          <div className="main-column">
            <div className="section-heading">
              <div><h2>Aktuelles</h2><p>Neue Dateien, Änderungen und Abgaben aus allen Kursen.</p></div>
              <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)} aria-label="Kurs filtern">
                <option value="all">Alle Kurse</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.shortName}</option>)}
              </select>
            </div>

            <div className="feed">
              {visibleItems.map((item) => {
                const course = courses.find((entry) => entry.id === item.courseId)!;
                return (
                  <button className="feed-item" key={item.id} onClick={() => safeOpen(item.url)}>
                    <span className="item-icon">{iconFor(item.type)}</span>
                    <span className="item-body">
                      <span className="item-meta"><b style={{ color: course.color }}>{course.shortName}</b>{item.isNew && <em>NEU</em>}</span>
                      <strong>{item.title}</strong>
                      {item.description && <small>{item.description}</small>}
                      {item.type === 'assignment' && item.dueAt && (
                        <small className="urgent">Abgabe {relativeDate(item.dueAt)}</small>
                      )}
                      {item.type === 'file' && item.availableAt && (
                        <small>Veröffentlicht am {new Date(item.availableAt).toLocaleDateString('de-DE')}</small>
                      )}
                    </span>
                    <span className="chevron">›</span>
                  </button>
                );
              })}
              {visibleItems.length === 0 && <div className="empty">Keine passenden Inhalte gefunden.</div>}
            </div>
          </div>

          <aside className="right-column">
            <div className="section-heading"><div><h2>Meine Kurse</h2><p>Direkter Zugriff</p></div></div>
            <div className="course-list">
              {courses.map((course) => (
                <button key={course.id} className="course-card" onClick={() => safeOpen(course.iliasUrl)}>
                  <span className="course-badge" style={{ background: course.color }}>{course.shortName}</span>
                  <span><strong>{course.title}</strong><small>{semester.name}</small></span>
                  <span>↗</span>
                </button>
              ))}
            </div>

            <div className="status-card">
              <div className="status-line"><span className="pulse" /> <strong>ILIAS-Verbindung bereit</strong></div>
              <p>Der nächste Entwicklungsschritt verbindet dieses Dashboard mit dem echten Crawler.</p>
              <code>Phase 2 · Domänenmodell</code>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
