import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDashboardAnalytics } from './admin-dashboard';

const mocks = vi.hoisted(() => ({
  getAllProducts: vi.fn(),
  getDocsFromServer: vi.fn(),
  getAggregateFromServer: vi.fn(),
  getCountFromServer: vi.fn(),
  state: {
    roles: [] as Array<{ id: string; role?: string | null }>,
    orderQueries: [] as Array<{
      reference: { collectionName: string };
      constraints: Array<{ field: string; operator: string; value: unknown }>;
    }>,
    recentOrders: {
      timestamp: [] as Array<{ id: string; data: Record<string, unknown> }>,
      iso: [] as Array<{ id: string; data: Record<string, unknown> }>,
      epoch: [] as Array<{ id: string; data: Record<string, unknown> }>,
      seconds: [] as Array<{ id: string; data: Record<string, unknown> }>,
      underscoredSeconds: [] as Array<{ id: string; data: Record<string, unknown> }>,
    },
    products: [] as Array<Record<string, unknown>>,
    customerCount: 0,
  },
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
  collection: (_db: unknown, collectionName: string) => ({ collectionName }),
  query: (reference: { collectionName: string }, ...constraints: unknown[]) => ({ reference, constraints }),
  where: (field: string, operator: string, value: unknown) => ({ field, operator, value }),
  getDocsFromServer: mocks.getDocsFromServer,
  getAllProducts: mocks.getAllProducts,
}));

vi.mock('firebase/firestore', () => ({
  count: () => ({ type: 'count' }),
  sum: (field: string) => ({ type: 'sum', field }),
  getAggregateFromServer: mocks.getAggregateFromServer,
  getCountFromServer: mocks.getCountFromServer,
}));

describe('getAdminDashboardAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.roles = [
      { id: 'admin', role: 'admin' },
      { id: 'staff', role: 'staff' },
      { id: 'empty', role: '' },
      { id: 'null', role: null },
      { id: 'customer', role: 'customer' },
      { id: 'missing' },
    ];
    mocks.state.products = [
      { id: 'low', name: 'Low stock', stock: 2, lowStockThreshold: 5, price: 100 },
      { id: 'default-threshold', name: 'Default threshold', stock: 10, lowStockThreshold: 0 },
      { id: 'available', name: 'Available', stock: 11, lowStockThreshold: 10 },
    ];
    mocks.state.customerCount = 6;
    mocks.state.orderQueries = [];
    mocks.state.recentOrders = {
      timestamp: [],
      iso: [],
      epoch: [],
      seconds: [],
      underscoredSeconds: [],
    };

    mocks.getAllProducts.mockImplementation(async () => mocks.state.products);
    mocks.getDocsFromServer.mockImplementation(async (firestoreQuery: {
      reference: { collectionName: string };
      constraints: Array<{ field: string; operator: string; value: unknown }>;
    }) => {
      if (firestoreQuery.reference.collectionName === 'customers') {
        return {
          docs: mocks.state.roles
            .filter((user) => user.role !== undefined && user.role !== 'customer')
            .map((user) => ({ id: user.id, data: () => ({ role: user.role }) })),
        };
      }
      mocks.state.orderQueries.push(firestoreQuery);
      const range = firestoreQuery.constraints.find((clause) => clause.operator === '>=');
      if (range?.field === 'orderDate') {
        const format = range.value instanceof Date ? 'timestamp' : typeof range.value === 'string' ? 'iso' : 'epoch';
        return { docs: mocks.state.recentOrders[format].map((order) => ({ id: order.id, data: () => order.data })) };
      }
      if (range?.field === 'orderDate.seconds') {
        return { docs: mocks.state.recentOrders.seconds.map((order) => ({ id: order.id, data: () => order.data })) };
      }
      return {
        docs: mocks.state.recentOrders.underscoredSeconds.map((order) => ({ id: order.id, data: () => order.data })),
      };
    });
    mocks.getAggregateFromServer.mockImplementation(async (firestoreQuery: {
      constraints: Array<{ field: string; operator: string; value: unknown }>;
    }) => {
      const cancelled = firestoreQuery.constraints.some((clause) => clause.value === 'cancelled');
      return {
        data: () => ({ count: cancelled ? 2 : 20, revenue: cancelled ? 50 : 500 }),
      };
    });
    mocks.getCountFromServer.mockImplementation(async (firestoreQuery: {
      reference: { collectionName: string };
      constraints: Array<{ value: unknown }>;
    }) => {
      const status = firestoreQuery.constraints[0]?.value;
      const counts: Record<string, number> = { pending: 3, processing: 4, shipped: 5 };
      return { data: () => ({ count: firestoreQuery.reference.collectionName === 'customers' ? mocks.state.customerCount : counts[String(status)] }) };
    });
  });

  it('aggregates totals and roles, limits product data, and deduplicates all recent date formats', async () => {
    const firstDay = new Date();
    firstDay.setDate(firstDay.getDate() - 6);
    firstDay.setHours(0, 0, 0, 0);
    const day = (offset: number) => {
      const result = new Date(firstDay);
      result.setDate(result.getDate() + offset);
      result.setHours(12, 0, 0, 0);
      return result;
    };
    const order = (id: string, orderDate: unknown, totalAmount: number, status = 'paid') => ({
      id,
      data: { orderDate, totalAmount, status },
    });
    const today = day(6);
    const todaySeconds = Math.floor(today.getTime() / 1000);
    mocks.state.recentOrders = {
      timestamp: [order('first-day', { toDate: () => day(0) }, 12.5), order('shared', { toDate: () => today }, 6)],
      iso: [order('iso-day', day(1).toISOString(), 10), order('shared', today.toISOString(), 6)],
      epoch: [order('epoch-day', day(2).getTime(), 15.25), order('today-revenue', today.getTime(), 30)],
      seconds: [order('seconds-day', { seconds: Math.floor(day(3).getTime() / 1000) }, 20)],
      underscoredSeconds: [
        order('underscored-day', { _seconds: Math.floor(day(4).getTime() / 1000) }, 18),
        order('cancelled', { _seconds: todaySeconds }, 100, 'cancelled'),
      ],
    };

    const result = await getAdminDashboardAnalytics();

    expect(result).toMatchObject({
      gmv: 450,
      totalOrders: 18,
      totalUsers: 4,
      totalProducts: 3,
      pendingOrders: 3,
      processingOrders: 4,
      shippedOrders: 5,
      conversionRate: '300.0',
      avgOrderValue: 25,
    });
    expect(result.lowStockProducts).toEqual([
      { id: 'low', name: 'Low stock', stock: 2, lowStockThreshold: 5 },
      { id: 'default-threshold', name: 'Default threshold', stock: 10, lowStockThreshold: 0 },
    ]);
    expect(result.lowStockCount).toBe(2);
    expect(result).not.toHaveProperty('allProducts');
    expect(result).not.toHaveProperty('allUsers');
    expect(result.revenueByDay[0].revenue).toBe(12.5);
    expect(result.revenueByDay[6].revenue).toBe(36);
    expect(result.revenueByDay).toHaveLength(7);
    expect(mocks.getDocsFromServer).toHaveBeenCalledTimes(6);
    expect(mocks.getAllProducts).toHaveBeenCalledTimes(1);
    expect(mocks.state.orderQueries).toHaveLength(5);
    expect(mocks.state.orderQueries.map((firestoreQuery) => firestoreQuery.constraints[0].field)).toEqual([
      'orderDate',
      'orderDate',
      'orderDate',
      'orderDate.seconds',
      'orderDate._seconds',
    ]);
    expect(mocks.state.orderQueries.every((firestoreQuery) =>
      firestoreQuery.constraints.some((clause) => clause.operator === '<'),
    )).toBe(true);
  });

  it('returns zero conversion and order value when there are no registered customers or orders', async () => {
    mocks.state.customerCount = 0;
    mocks.getAggregateFromServer.mockImplementation(async () => ({
      data: () => ({ count: 0, revenue: 0 }),
    }));

    const result = await getAdminDashboardAnalytics();

    expect(result.totalOrders).toBe(0);
    expect(result.gmv).toBe(0);
    expect(result.conversionRate).toBe('0');
    expect(result.avgOrderValue).toBe(0);
  });
});

describe('admin dashboard Firestore indexes', () => {
  it('covers the cancelled-order count and revenue aggregation', () => {
    const config = JSON.parse(
      readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'),
    ) as { indexes: Array<Record<string, unknown>> };

    expect(config.indexes).toContainEqual({
      collectionGroup: 'orders',
      queryScope: 'COLLECTION',
      fields: [
        { fieldPath: 'status', order: 'ASCENDING' },
        { fieldPath: 'totalAmount', order: 'ASCENDING' },
      ],
    });
  });
});
