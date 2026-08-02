// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIliasPage } from './parser';

const fixturePath = resolve(
  process.cwd(),
  'src',
  'infrastructure',
  'ilias',
  '__fixtures__',
  'tutoriumsblätter.html',
);

const html = readFileSync(fixturePath, 'utf8');

const pageUrl =
  'https://ilias3.uni-stuttgart.de/ilias.php' +
  '?baseClass=ilrepositorygui' +
  '&cmdClass=ilObjFolderGUI' +
  '&ref_id=4364743';

describe('parseIliasPage', () => {
  it('liest Ordner aus einer ILIAS-Seite', () => {
  const html = `
    <html>
      <body>
        <a
          class="il_ContainerItemTitle"
          href="https://ilias3.uni-stuttgart.de/go/fold/123456"
        >
          Vorlesung
        </a>

        <a
          class="il_ContainerItemTitle"
          href="ilias.php?cmdClass=ilObjFolderGUI&ref_id=654321"
        >
          Tutorium
        </a>
      </body>
    </html>
  `;

  const result = parseIliasPage(
    html,
    'course:lds',
    'https://ilias3.uni-stuttgart.de/',
  );

  expect(result.folders).toEqual([
    {
      id: 'folder:123456',
      courseId: 'course:lds',
      iliasRefId: '123456',
      title: 'Vorlesung',
      url:
        'https://ilias3.uni-stuttgart.de/go/fold/123456',
      path: ['Vorlesung'],
    },
    {
      id: 'folder:654321',
      courseId: 'course:lds',
      iliasRefId: '654321',
      title: 'Tutorium',
      url:
        'https://ilias3.uni-stuttgart.de/' +
        'ilias.php?cmdClass=ilObjFolderGUI&ref_id=654321',
      path: ['Tutorium'],
    },
  ]);
});

it('ordnet Dateien der aktuell geöffneten Ordnerseite zu', () => {
  const folderHtml = `
    <html>
      <body>
        <h3 class="il_ContainerItemTitle">
          <a
            class="il_ContainerItemTitle"
            href="ilias.php?cmdClass=ilObjFileGUI&ref_id=777777"
          >
            Beispiel.pdf
          </a>
        </h3>
      </body>
    </html>
  `;

  const result = parseIliasPage(
    folderHtml,
    'course:lds',
    'https://ilias3.uni-stuttgart.de/' +
      'ilias.php?cmdClass=ilObjFolderGUI' +
      '&ref_id=123456',
  );

  expect(result.files[0]).toMatchObject({
    id: 'file:777777',
    courseId: 'course:lds',
    folderId: 'folder:123456',
    iliasRefId: '777777',
    title: 'Beispiel.pdf',
  });
});

  it('erkennt alle 13 Tutoriumsblätter', () => {
    const result = parseIliasPage(html, 'course:lds', pageUrl);

    expect(result.files).toHaveLength(13);
    expect(result.folders).toHaveLength(0);
    expect(result.assignments).toHaveLength(0);
  });

  it('liest Tutoriumsblatt01 korrekt aus', () => {
    const result = parseIliasPage(html, 'course:lds', pageUrl);

    const file = result.files.find(
      (entry) => entry.iliasRefId === '4409908',
    );

    expect(file).toBeDefined();
    expect(file).toMatchObject({
      id: 'file:4409908',
      courseId: 'course:lds',
      folderId: 'folder:4364743',
      title: 'Tutoriumsblatt01',
      mimeType: 'application/pdf',
      pageCount: 2,
      isNew: false,
      isDownloaded: false,
    });

    expect(file?.fileSizeBytes).toBeGreaterThan(600_000);
    expect(file?.availableAt).toContain('2026-04-13');
  });

  it('übernimmt die Korrektur-Beschreibung von Blatt 04', () => {
    const result = parseIliasPage(html, 'course:lds', pageUrl);

    const file = result.files.find(
      (entry) => entry.title === 'Tutoriumsblatt04',
    );

    expect(file?.description).toContain(
      'Aufgabe 2 wurde überarbeitet/korrigiert.',
    );
  });

  it('erzeugt für jede Datei eine eindeutige ref_id', () => {
    const result = parseIliasPage(html, 'course:lds', pageUrl);

    const refIds = result.files.map((file) => file.iliasRefId);

    expect(new Set(refIds).size).toBe(13);
  });

  it('extrahiert den Abgabe-Hinweis von einer Übungs-Detailseite', () => {
    const detailHtml = `
      <html>
        <body>
          <h1>Abgabe Blatt 13</h1>
          <div class="ilBoxInfo">
            Abgabebedingungen: Abgabe als einzelne PDF-Datei
            bis zum Ende der Übungszeit.
          </div>
        </body>
      </html>
    `;

    const result = parseIliasPage(
      detailHtml,
      'course:lds',
      'https://ilias3.uni-stuttgart.de/' +
        'ilias.php?baseClass=ilexercisehandlergui' +
        '&cmdClass=ilAssignmentPresentationGUI' +
        '&ref_id=4435163&ass_id=138187',
    );

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].submissionHint).toContain(
      'Abgabebedingungen',
    );
  });

  it('extrahiert den Abgabe-Hinweis ohne Hinweis-Box', () => {
    const detailHtml = `
      <html>
        <body>
          <h1>Abgabe Blatt 14</h1>
          <p>
            Abgabebedingungen: Lösung bitte per ILIAS
            hochladen. Danach keine Änderungen mehr möglich.
          </p>
        </body>
      </html>
    `;

    const result = parseIliasPage(
      detailHtml,
      'course:lds',
      'https://ilias3.uni-stuttgart.de/' +
        'ilias.php?baseClass=ilexercisehandlergui' +
        '&cmdClass=ilAssignmentPresentationGUI' +
        '&ref_id=4435164&ass_id=138188',
    );

    expect(result.assignments).toHaveLength(1);
    expect(
      result.assignments[0].submissionHint,
    ).toContain(
      'Lösung bitte per ILIAS hochladen',
    );
  });

  it('extrahiert Punkte von einer bewerteten Abgabe', () => {
    const detailHtml = `
      <html>
        <body>
          <h1>Abgabe Blatt 05</h1>
          <div>
            Erreichte Punkte: 8 von 10 Punkten
          </div>
        </body>
      </html>
    `;

    const result = parseIliasPage(
      detailHtml,
      'course:lds',
      'https://ilias3.uni-stuttgart.de/' +
        'ilias.php?baseClass=ilexercisehandlergui' +
        '&cmdClass=ilAssignmentPresentationGUI' +
        '&ref_id=4435163&ass_id=138185',
    );

    expect(result.assignments[0].achievedPoints).toBe(8);
    expect(result.assignments[0].totalPoints).toBe(10);
    expect(result.assignments[0].status).toBe('graded');
  });

  it('kennt die maximale Punktzahl unbewerteter Abgaben', () => {
    const detailHtml = `
      <html>
        <body>
          <h1>Abgabe Blatt 06</h1>
          <div>
            Maximale Punkte: 10
          </div>
        </body>
      </html>
    `;

    const result = parseIliasPage(
      detailHtml,
      'course:lds',
      'https://ilias3.uni-stuttgart.de/' +
        'ilias.php?baseClass=ilexercisehandlergui' +
        '&cmdClass=ilAssignmentPresentationGUI' +
        '&ref_id=4435163&ass_id=138186',
    );

    expect(
      result.assignments[0].achievedPoints,
    ).toBeUndefined();
    expect(result.assignments[0].totalPoints).toBe(10);
    expect(result.assignments[0].status).toBe('not-started');
  });

  it('führt dieselbe abgegebene Datei aus mehreren verschachtelten Containern zusammen', () => {
    const detailHtml = `
      <html>
        <body>
          <section>
            <tr>
              Abgegebene Dateien
              <a href="https://ilias3.uni-stuttgart.de/ilias.php?baseClass=ilexercisehandlergui&cmdClass=ilExSubmissionFileGUI&cmd=submissionScreen&ref_id=4435163&ass_id=131174">2. Hausübungsblatt LDS.pdf</a>
            </tr>
          </section>
        </body>
      </html>
    `;

    const result = parseIliasPage(
      detailHtml,
      'course:lds',
      'https://ilias3.uni-stuttgart.de/' +
        'ilias.php?baseClass=ilexercisehandlergui' +
        '&cmdClass=ilAssignmentPresentationGUI' +
        '&ref_id=4435163&ass_id=131174',
    );

    const submitted = result.submissionFiles.filter(
      (file) => file.kind === 'submitted',
    );

    expect(submitted).toHaveLength(1);
    expect(submitted[0].title).toBe(
      '2. Hausübungsblatt LDS.pdf',
    );
  });

  it('ignoriert Abgabe-Zeilen fremder Aufgaben aus einer Übungs-Übersicht', () => {
    const overviewHtml = `
      <html>
        <body>
          <table>
            <tbody>
              <tr>
                <td>
                  Abgegebene Dateien
                  <a href="https://ilias3.uni-stuttgart.de/ilias.php?baseClass=ilexercisehandlergui&cmdClass=ilAssignmentPresentationGUI&ref_id=4435163&ass_id=131174&mode=all">1. Hausübungsblatt LDS.pdf</a>
                </td>
              </tr>
              <tr>
                <td>
                  Abgegebene Dateien
                  <a href="https://ilias3.uni-stuttgart.de/ilias.php?baseClass=ilexercisehandlergui&cmdClass=ilAssignmentPresentationGUI&ref_id=4435163&ass_id=131175&mode=past&from_overview=1">Beendet am23. Apr 2026, 15:30 AnforderungOptional</a>
                </td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    const result = parseIliasPage(
      overviewHtml,
      'course:lds',
      'https://ilias3.uni-stuttgart.de/' +
        'ilias.php?baseClass=ilexercisehandlergui' +
        '&cmdClass=ilObjExerciseGUI&cmd=showOverview' +
        '&ref_id=4435163&ass_id=131174&mode=all',
    );

    const submitted = result.submissionFiles.filter(
      (file) => file.kind === 'submitted',
    );

    expect(submitted).toHaveLength(1);
    expect(submitted[0].title).toBe(
      '1. Hausübungsblatt LDS.pdf',
    );
  });

  it('ignoriert Platzhaltertext und Fristangaben ohne echten Download-Link', () => {
    const detailHtml = `
      <html>
        <body>
          <section>
            Abgegebene Dateien
            Sie haben noch keine Datei abgegeben.
          </section>
          <tr>
            Abgegebene Dateien
            <a href="https://ilias3.uni-stuttgart.de/ilias.php?baseClass=ilexercisehandlergui&cmdClass=ilAssignmentPresentationGUI&ref_id=4435163&ass_id=131174">Beendet am23. Apr 2026, 15:30 AnforderungOptional</a>
          </tr>
        </body>
      </html>
    `;

    const result = parseIliasPage(
      detailHtml,
      'course:lds',
      'https://ilias3.uni-stuttgart.de/' +
        'ilias.php?baseClass=ilexercisehandlergui' +
        '&cmdClass=ilAssignmentPresentationGUI' +
        '&ref_id=4435163&ass_id=131174',
    );

    const submitted = result.submissionFiles.filter(
      (file) => file.kind === 'submitted',
    );

    expect(submitted).toHaveLength(0);
  });
});