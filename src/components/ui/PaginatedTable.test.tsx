import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaginatedTable } from './PaginatedTable';
import { Pagination } from './Pagination';

describe('table pagination', () => {
  it('limits browse tables to eight rows without losing headers', () => {
    const html = renderToStaticMarkup(<PaginatedTable><thead><tr><th>Reference</th></tr></thead><tbody>
      {Array.from({ length: 10 }, (_, i) => <tr key={i}><td>record-{i}</td></tr>)}
    </tbody></PaginatedTable>);
    expect(html).toContain('Reference');
    expect(html).toContain('record-7');
    expect(html).not.toContain('record-8');
    expect(html).toContain('of <span class="font-medium text-brand-slate">2</span>');
  });

  it('retains empty states with page zero and disabled browsing', () => {
    const html = renderToStaticMarkup(<PaginatedTable><tbody><tr><td colSpan={5}>No records</td></tr></tbody></PaginatedTable>);
    expect(html).toContain('No records');
    expect(html).toContain('Showing page <span class="font-medium text-brand-slate">0</span>');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('justify-end');
  });

  it('keeps both controls disabled on a single page', () => {
    const html = renderToStaticMarkup(<Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />);
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it('does not add a second paginator to tables with external pagination', () => {
    const html = renderToStaticMarkup(<PaginatedTable paginate={false}><tbody>{Array.from({ length: 9 }, (_, i) => <tr key={i}><td>record-{i}</td></tr>)}</tbody></PaginatedTable>);
    expect(html).toContain('record-8');
    expect(html).not.toContain('Showing page');
  });
});
