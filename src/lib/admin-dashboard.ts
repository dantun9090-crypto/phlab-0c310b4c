import type { Product } from '@/lib/firebase';
import { toDateSafe } from '@/lib/to-date';

export interface AdminDashboardAnalytics {
  gmv: number;
  totalOrders: number;
  totalUsers: number;
  totalProducts: number;
  pendingOrders: number;
  processingOrders: number;
  shippedOrders: number;
  lowStockProducts: Array<Pick<Product, 'id' | 'name' | 'stock' | 'lowStockThreshold'>>;
  lowStockCount: number;
  conversionRate: string;
  avgOrderValue: number;
  revenueByDay: Array<{ label: string; revenue: number }>;
}

function getLocalDayRange() {
  const today = new Date();
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - 6);
  firstDay.setHours(0, 0, 0, 0);
  const dayAfterLast = new Date(today);
  dayAfterLast.setDate(dayAfterLast.getDate() + 1);
  dayAfterLast.setHours(0, 0, 0, 0);
  return { firstDay, dayAfterLast };
}

export async function getAdminDashboardAnalytics(): Promise<AdminDashboardAnalytics> {
  const firebase = await import('@/lib/firebase');
  const firestore = await import('firebase/firestore');
  const {
    count,
    getAggregateFromServer,
    getCountFromServer,
    sum,
  } = firestore;
  const { db, collection, getAllProducts, getDocsFromServer, query, where } = firebase;

  const orders = collection(db, 'orders');
  const customers = collection(db, 'customers');
  const allOrdersQuery = query(orders);
  const cancelledOrdersQuery = query(orders, where('status', '==', 'cancelled'));
  const statusCountQuery = (status: string) => query(orders, where('status', '==', status));
  const customersQuery = query(customers);
  const nonCustomerRolesQuery = query(customers, where('role', '!=', 'customer'));

  const { firstDay, dayAfterLast } = getLocalDayRange();
  const orderDateRanges = [
    { field: 'orderDate', start: firstDay, end: dayAfterLast },
    { field: 'orderDate', start: firstDay.toISOString(), end: dayAfterLast.toISOString() },
    { field: 'orderDate', start: firstDay.getTime(), end: dayAfterLast.getTime() },
    { field: 'orderDate.seconds', start: firstDay.getTime() / 1000, end: dayAfterLast.getTime() / 1000 },
    { field: 'orderDate._seconds', start: firstDay.getTime() / 1000, end: dayAfterLast.getTime() / 1000 },
  ];
  const recentOrderQueries = orderDateRanges.map(({ field, start, end }) =>
    query(
      orders,
      where(field, '>=', start),
      where(field, '<', end),
    ),
  );

  const [
    allOrdersAggregate,
    cancelledOrdersAggregate,
    pendingCount,
    processingCount,
    shippedCount,
    customerCount,
    roleDocs,
    recentOrderSnapshots,
    products,
  ] = await Promise.all([
    getAggregateFromServer(allOrdersQuery, { count: count(), revenue: sum('totalAmount') }),
    getAggregateFromServer(cancelledOrdersQuery, { count: count(), revenue: sum('totalAmount') }),
    getCountFromServer(statusCountQuery('pending')),
    getCountFromServer(statusCountQuery('processing')),
    getCountFromServer(statusCountQuery('shipped')),
    getCountFromServer(customersQuery),
    getDocsFromServer(nonCustomerRolesQuery),
    Promise.all(recentOrderQueries.map((recentQuery) => getDocsFromServer(recentQuery))),
    getAllProducts(),
  ]);

  const allOrdersData = allOrdersAggregate.data();
  const cancelledOrdersData = cancelledOrdersAggregate.data();
  const totalOrders = Math.max(0, allOrdersData.count - cancelledOrdersData.count);
  const gmv = allOrdersData.revenue - cancelledOrdersData.revenue;
  const totalRegisteredCustomers = customerCount.data().count;
  const nonCustomerUsers = roleDocs.docs.filter((userDoc) => Boolean(userDoc.data().role)).length;
  const totalUsers = Math.max(0, totalRegisteredCustomers - nonCustomerUsers);
  const lowStockProducts = products
    .filter((product) => product.stock <= (product.lowStockThreshold || 10))
    .map(({ id, name, stock, lowStockThreshold }) => ({ id, name, stock, lowStockThreshold }));
  const uniqueRecentOrders = new Map<string, Record<string, unknown>>();

  for (const snapshot of recentOrderSnapshots) {
    for (const orderDoc of snapshot.docs) {
      if (!uniqueRecentOrders.has(orderDoc.id)) {
        uniqueRecentOrders.set(orderDoc.id, { id: orderDoc.id, ...orderDoc.data() });
      }
    }
  }

  const revenueByDay = Array.from({ length: 7 }, (_, index) => {
    const dayDate = new Date(firstDay);
    dayDate.setDate(dayDate.getDate() + index);
    const dayStart = new Date(dayDate);
    const dayEnd = new Date(dayDate);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const revenue = Array.from(uniqueRecentOrders.values()).reduce((sumRevenue, order) => {
      if (order.status === 'cancelled') return sumRevenue;
      const date = toDateSafe(order.orderDate);
      if (!date || date < dayStart || date >= dayEnd) return sumRevenue;
      const amount = typeof order.totalAmount === 'number' ? order.totalAmount : Number(order.totalAmount) || 0;
      return sumRevenue + amount;
    }, 0);
    return {
      label: dayDate.toLocaleDateString('en-GB', { weekday: 'short' }),
      revenue,
    };
  });

  return {
    gmv,
    totalOrders,
    totalUsers,
    totalProducts: products.length,
    pendingOrders: pendingCount.data().count,
    processingOrders: processingCount.data().count,
    shippedOrders: shippedCount.data().count,
    lowStockProducts,
    lowStockCount: lowStockProducts.length,
    conversionRate: totalRegisteredCustomers > 0
      ? ((totalOrders / totalRegisteredCustomers) * 100).toFixed(1)
      : '0',
    avgOrderValue: totalOrders > 0 ? gmv / totalOrders : 0,
    revenueByDay,
  };
}
