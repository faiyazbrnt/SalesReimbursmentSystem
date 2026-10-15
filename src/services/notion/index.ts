import { Client, isFullDatabase, isFullDataSource } from '@notionhq/client';

export const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

export async function fetchTasks(databaseId?: string) {
  try {
    const targetDbId = databaseId || process.env.NOTION_DATABASE_ID?.trim();
    if (!targetDbId) {
      throw new Error('Notion Database ID is required');
    }

    const db = await notion.databases.retrieve({ database_id: targetDbId });
    if (!isFullDatabase(db)) {
      throw new Error('Received partial database response from Notion');
    }

    const dataSourceId = db.data_sources?.[0]?.id;
    if (!dataSourceId) {
      throw new Error('No data source found for database');
    }

    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
    });
    return response.results;
  } catch (error) {
    console.error('Error fetching tasks from Notion:', error);
    throw error;
  }
}

export async function createTask(databaseId: string | undefined, title: string) {
  try {
    const targetDbId = databaseId || process.env.NOTION_DATABASE_ID?.trim();
    if (!targetDbId) {
      throw new Error('Notion Database ID is required');
    }

    const db = await notion.databases.retrieve({ database_id: targetDbId });
    let titlePropName = 'title';

    if (isFullDatabase(db) && db.data_sources?.[0]?.id) {
      const ds = await notion.dataSources.retrieve({ data_source_id: db.data_sources[0].id });
      if (isFullDataSource(ds)) {
        const foundTitleProp = Object.entries(ds.properties).find(([_, prop]) => prop.type === 'title');
        if (foundTitleProp) {
          titlePropName = foundTitleProp[0];
        }
      }
    }

    const response = await notion.pages.create({
      parent: { database_id: targetDbId },
      properties: {
        [titlePropName]: {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        },
      },
    });
    return response;
  } catch (error) {
    console.error('Error creating task in Notion:', error);
    throw error;
  }
}
