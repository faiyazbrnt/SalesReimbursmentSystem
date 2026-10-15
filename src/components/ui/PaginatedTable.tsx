import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode, type TableHTMLAttributes } from 'react';
import { Pagination } from './Pagination';

type TableChild = ReactElement<{ children?: ReactNode; colSpan?: number }>;

/** Paginate browse tables while retaining their existing headers and empty state. */
export function PaginatedTable({ children, paginate = true, ...props }: TableHTMLAttributes<HTMLTableElement> & { paginate?: boolean }) {
  const sections = Children.toArray(children);
  const body = sections.find(child => isValidElement(child) && child.type === 'tbody') as TableChild | undefined;
  const rows = Children.toArray(body?.props.children);
  const empty = rows.length === 1 && isValidElement(rows[0]) && Children.toArray((rows[0] as TableChild).props.children)
    .some(cell => isValidElement(cell) && Number((cell as TableChild).props.colSpan) > 1);
  const totalPages = Math.ceil((empty ? 0 : rows.length) / 8);
  const signature = rows.map(row => isValidElement(row) ? row.key : '').join('|');
  const [position, setPosition] = useState({ signature, page: 1 });
  const page = Math.max(1, Math.min(position.signature === signature ? position.page : 1, totalPages));
  if (!paginate || !body) return <table {...props}>{children}</table>;
  return <>
    <table {...props}>{sections.map(section => section === body
      ? cloneElement(body, {}, empty ? rows : rows.slice((page - 1) * 8, page * 8))
      : section)}</table>
    <Pagination currentPage={page} totalPages={totalPages} onPageChange={next => setPosition({ signature, page: next })} />
  </>;
}
