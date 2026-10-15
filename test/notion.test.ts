import { describe, expect, it, vi } from 'vitest';
import { fetchTasks, createTask, notion } from '../src/services/notion';

describe('Notion service', () => {
  it('fetchTasks queries the database data source', async () => {
    vi.spyOn(notion.databases, 'retrieve').mockResolvedValueOnce({
      object: 'database',
      id: 'db-123',
      title: [{ plain_text: 'SRS' }],
      data_sources: [{ id: 'ds-123', name: 'Tasks' }],
    } as any);

    vi.spyOn(notion.dataSources, 'query').mockResolvedValueOnce({
      results: [{ id: 'page-1' }],
    } as any);

    const results = await fetchTasks('db-123');
    expect(results).toEqual([{ id: 'page-1' }]);
    expect(notion.dataSources.query).toHaveBeenCalledWith({ data_source_id: 'ds-123' });
  });

  it('createTask finds title property and creates page', async () => {
    vi.spyOn(notion.databases, 'retrieve').mockResolvedValueOnce({
      object: 'database',
      id: 'db-123',
      title: [{ plain_text: 'SRS' }],
      data_sources: [{ id: 'ds-123', name: 'Tasks' }],
    } as any);

    vi.spyOn(notion.dataSources, 'retrieve').mockResolvedValueOnce({
      object: 'data_source',
      id: 'ds-123',
      title: [{ plain_text: 'Tasks' }],
      properties: {
        table: { id: 'title', type: 'title', title: {} },
      },
    } as any);

    vi.spyOn(notion.pages, 'create').mockResolvedValueOnce({
      id: 'new-page-id',
    } as any);

    const page = await createTask('db-123', 'My New Task');
    expect(page).toEqual({ id: 'new-page-id' });
    expect(notion.pages.create).toHaveBeenCalledWith({
      parent: { database_id: 'db-123' },
      properties: {
        table: {
          title: [{ text: { content: 'My New Task' } }],
        },
      },
    });
  });
});
