import { describe, it, expect } from 'vitest';
import { activityTotals, publicationActivityCsv, selectPublicationActivity, publicationPdfActivity } from './publication-pdf-activity';
import { type PdfAccessRow } from './pdf-access';
const row = (o: Partial<PdfAccessRow> = {}): PdfAccessRow => ({ event_name:'publication_click', event_id:'a', occurred_at:'2026-10-16T12:00:00Z', visitor_id:'v', session_id:'s', publication_id:'p', publication_title:'Noach', metadata:{action:'open_pdf'}, ...o });
const kept = new Set(['s']);
describe('publication activity', () => {
  it('separates measures, collapses retries and paired downloads, preserves uncapped actions', () => {
    const preview = row({event_name:'pdf_open',event_id:'preview'});
    const rows = [...Array.from({length:8},(_,i) => row({event_id:`click${i}`})),preview,{...preview},
      row({event_name:'download',metadata:{action_id:'d'}}),row({event_name:'download_served',metadata:{action_id:'d'}}),
      row({event_name:'download_served',metadata:{action_id:'unpaired'}}),row({event_name:'download_served',metadata:{}})];
    const p = publicationPdfActivity(rows,kept).publications[0];
    expect([p.deliberateOpens,p.automaticLoads,p.historicalDownloads,p.historicalRedirects,p.uniqueVisitors]).toEqual([8,1,1,1,1]);
    expect(rows).toHaveLength(14);
  });
  it('includes preview-only and zero-activity publications; excludes nonhuman and unidentified activity', () => {
    const result = publicationPdfActivity([row({event_name:'pdf_open'}),row({session_id:'bot'}),row({visitor_id:null}),row({publication_id:null,event_id:'missing'})],kept,[{id:'zero',title:'Zero',parsha_key:'Noach'}]);
    expect(result.publications).toHaveLength(2);
    expect(result.publications.find(p=>p.publicationId==='zero')?.deliberateOpens).toBe(0);
    expect(result.publications.find(p=>p.publicationId==='p')?.automaticLoads).toBe(1);
    expect(result.missingPublication).toBe(1);
  });
  it('deduplicates visitor totals across PDFs and exports separate measures with CSV escaping', () => {
    const result = publicationPdfActivity([row({publication_title:'A, "title"'}),row({publication_id:'q',event_id:'b'})],kept);
    expect(activityTotals(result.publications).uniqueVisitors).toBe(1);
    expect(publicationActivityCsv(result.publications)).toContain('"A, ""title"""');
    expect(publicationActivityCsv(result.publications).split('\n')).toHaveLength(3);
  });
});

it('filters Noach before totals and CSV, ranks by the selected measure without mutating input', () => {
  const all = publicationPdfActivity([row(), row({event_name:'pdf_open',publication_id:'preview'}),row({publication_id:'other',event_id:'other'})], kept,
    [{id:'p',title:'A',parsha_key:'Noach'},{id:'preview',title:'B',parsha_key:'Noach'},{id:'other',title:'C',parsha_key:'Bereishis'}]).publications;
  const selected = selectPublicationActivity(all,'Noach','automaticLoads');
  expect(selected.map(p=>p.publicationId)).toEqual(['preview','p']);
  expect(activityTotals(selected).deliberateOpens).toBe(1);
  expect(publicationActivityCsv(selected)).not.toContain('Bereishis');
  expect(all[0].publicationId).toBe('p');
});
