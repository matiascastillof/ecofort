import { Router } from 'express';
import pool from '../db.js';
import { validateOrderPayload, handleValidation } from '../validators/orders.js';

const router = Router();

const parsePositiveInteger = (value: unknown, field: string) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }

  return parsed;
};

const buildCustomerLookup = async (customerInput: unknown) => {
  if (customerInput === undefined || customerInput === null || String(customerInput).trim() === '') {
    return null;
  }

  const value = String(customerInput).trim();

  if (/^\d+$/.test(value)) {
    const customer = await pool.query(
      'SELECT id, email, full_name, city FROM customers WHERE id = $1',
      [Number(value)],
    );

    return customer.rows[0] ?? null;
  }

  const customer = await pool.query(
    'SELECT id, email, full_name, city FROM customers WHERE email = $1',
    [value],
  );

  return customer.rows[0] ?? null;
};

router.post('/orders', validateOrderPayload, handleValidation, async (req: any, res: any) => {
  try {
    const customerInput = req.body.customer_id ?? req.body.customerId ?? req.body.customer_email ?? req.body.customerEmail;

    if (!customerInput) {
      return res.status(400).json({ error: 'customer_id or customer_email is required' });
    }

    const customer = await buildCustomerLookup(customerInput);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

    if (rawItems.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array' });
    }

    const aggregatedItems = new Map<string, number>();

    for (const item of rawItems) {
      const productIdentifier = item.product_id ?? item.productId ?? item.sku ?? item.product ?? item.id;
      const quantity = parsePositiveInteger(item.quantity ?? item.qty, 'quantity');

      if (!productIdentifier || String(productIdentifier).trim() === '') {
        return res.status(400).json({ error: 'Each item requires a valid product_id or sku' });
      }

      const sku = String(productIdentifier).trim();
      aggregatedItems.set(sku, (aggregatedItems.get(sku) ?? 0) + quantity);
    }

    const skus = Array.from(aggregatedItems.keys());
    const productsResult = await pool.query(
      'SELECT sku, name, price, stock FROM products WHERE sku = ANY($1)',
      [skus],
    );

    if (productsResult.rowCount !== skus.length) {
      const foundSkus = new Set(productsResult.rows.map((row) => row.sku));
      const missingSku = skus.find((sku) => !foundSkus.has(sku));
      return res.status(404).json({ error: `Product not found: ${missingSku}` });
    }

    const productsBySku = new Map(productsResult.rows.map((row) => [row.sku, row]));

    for (const [sku, quantity] of aggregatedItems.entries()) {
      const product = productsBySku.get(sku);
      if (!product) {
        return res.status(404).json({ error: `Product not found: ${sku}` });
      }

      if (Number(product.stock) < quantity) {
        return res.status(409).json({
          error: 'Insufficient stock',
          sku,
          available: Number(product.stock),
          requested: quantity,
        });
      }
    }

    const orderRef = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const createdAt = new Date().toISOString();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        'INSERT INTO orders (order_ref, customer_email, status, created_at) VALUES ($1, $2, $3, $4)',
        [orderRef, customer.email, 'pending', createdAt],
      );

      const itemsPayload: Array<{ sku: string; quantity: number; unit_price: number; name: string }> = [];

      for (const [sku, quantity] of aggregatedItems.entries()) {
        const product = productsBySku.get(sku)!;
        const unitPrice = Number(product.price);

        await client.query(
          'INSERT INTO order_items (order_ref, sku, quantity, unit_price) VALUES ($1, $2, $3, $4)',
          [orderRef, sku, quantity, unitPrice],
        );

        await client.query(
          'UPDATE products SET stock = stock - $1 WHERE sku = $2',
          [quantity, sku],
        );

        itemsPayload.push({
          sku,
          quantity,
          unit_price: unitPrice,
          name: product.name,
        });
      }

      await client.query('COMMIT');

      return res.status(201).json({
        order_ref: orderRef,
        status: 'pending',
        created_at: createdAt,
        customer: {
          email: customer.email,
          full_name: customer.full_name,
          city: customer.city,
        },
        items: itemsPayload.map((item) => ({
          ...item,
          subtotal: Number((item.unit_price * item.quantity).toFixed(2)),
        })),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('POST /orders error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const normalizeDateParam = (value: unknown, name: string) => {
  if (!value || String(value).trim() === '') {
    return null;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be a valid ISO-8601 date`);
  }

  return date.toISOString();
};

router.get('/orders', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const offset = (page - 1) * limit;

    const status = req.query.status ? String(req.query.status).trim() : null;
    const from = normalizeDateParam(req.query.from ?? req.query.created_at_from, 'from');
    const to = normalizeDateParam(req.query.to ?? req.query.created_at_to, 'to');

    const params: any[] = [];
    const conditions: string[] = [];
    let index = 1;

    const addCondition = (clause: string, value: any) => {
      params.push(value);
      conditions.push(`${clause.replace('?', `$${index}`)}`);
      index += 1;
    };

    if (status) {
      addCondition('o.status = ?', status);
    }

    if (from) {
      addCondition('o.created_at >= ?', from);
    }

    if (to) {
      addCondition('o.created_at <= ?', to);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(*)::int AS total FROM orders o${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = Number(countResult.rows[0].total ?? 0);

    const listQuery = `
      SELECT
        o.id,
        o.order_ref,
        o.customer_email,
        c.full_name,
        c.city,
        o.status,
        o.created_at,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_amount
      FROM orders o
      LEFT JOIN customers c ON c.email = o.customer_email
      LEFT JOIN order_items oi ON oi.order_ref = o.order_ref
      ${whereClause}
      GROUP BY o.id, o.order_ref, o.customer_email, c.full_name, c.city, o.status, o.created_at
      ORDER BY o.created_at DESC
      LIMIT $${index} OFFSET $${index + 1}
    `;

    const queryParams = [...params, limit, offset];
    const result = await pool.query(listQuery, queryParams);

    return res.json({
      data: result.rows.map((row) => ({
        ...row,
        total_amount: Number(row.total_amount ?? 0),
      })),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error('GET /orders error:', error);
    return res.status(400).json({ error: (error as Error).message || 'Invalid query parameters' });
  }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const orderParam = req.params.id;
    const queryText = `
      SELECT
        o.id,
        o.order_ref,
        o.customer_email,
        c.full_name,
        c.city,
        o.status,
        o.created_at,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_amount
      FROM orders o
      LEFT JOIN customers c ON c.email = o.customer_email
      LEFT JOIN order_items oi ON oi.order_ref = o.order_ref
      WHERE o.id::text = $1 OR o.order_ref = $1
      GROUP BY o.id, o.order_ref, o.customer_email, c.full_name, c.city, o.status, o.created_at
    `;

    const result = await pool.query(queryText, [orderParam]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = result.rows[0];
    const itemsResult = await pool.query(
      `
        SELECT
          oi.sku,
          p.name AS product_name,
          oi.quantity,
          oi.unit_price,
          (oi.quantity * oi.unit_price) AS subtotal
        FROM order_items oi
        INNER JOIN products p ON p.sku = oi.sku
        WHERE oi.order_ref = $1
      `,
      [order.order_ref],
    );

    return res.json({
      ...order,
      total_amount: Number(order.total_amount ?? 0),
      items: itemsResult.rows.map((item) => ({
        ...item,
        unit_price: Number(item.unit_price),
        subtotal: Number(item.subtotal),
      })),
    });
  } catch (error) {
    console.error('GET /orders/:id error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/reports/top-customers', async (req, res) => {
  try {
    const asOf = normalizeDateParam(req.query.as_of ?? req.query.asOf ?? req.query.date ?? new Date().toISOString(), 'as_of') ?? new Date().toISOString();
    const startDate = new Date(asOf);
    startDate.setUTCDate(startDate.getUTCDate() - 30);

    const result = await pool.query(
      `
        SELECT
          c.email,
          c.full_name,
          c.city,
          SUM(oi.quantity * oi.unit_price) AS total_amount
        FROM orders o
        INNER JOIN customers c ON c.email = o.customer_email
        INNER JOIN order_items oi ON oi.order_ref = o.order_ref
        WHERE o.created_at >= $1
          AND o.created_at <= $2
          AND o.status <> 'cancelled'
        GROUP BY c.email, c.full_name, c.city
        ORDER BY total_amount DESC, c.email ASC
        LIMIT 10
      `,
      [startDate.toISOString(), asOf],
    );

    return res.json({
      as_of: asOf,
      data: result.rows.map((row) => ({
        customer: {
          email: row.email,
          full_name: row.full_name,
          city: row.city,
        },
        total: Number(row.total_amount ?? 0),
      })),
    });
  } catch (error) {
    console.error('GET /reports/top-customers error:', error);
    return res.status(400).json({ error: (error as Error).message || 'Invalid request' });
  }
});

const roundMoney = (value: number) => Number(value.toFixed(2));

const orderItemAmount = (quantity: number, unitPrice: number) => roundMoney(quantity * unitPrice);

const getCouponType = (coupon: any) => {
  if (coupon.type === 'percentage' || coupon.percentage !== undefined) return 'percentage';
  if (coupon.type === 'fixed_amount' || coupon.fixed_amount !== undefined) return 'fixed_amount';
  if (coupon.type === 'n_for_m' || coupon.n_for_m !== undefined || (coupon.n !== undefined && coupon.m !== undefined)) return 'n_for_m';
  return null;
};

const isCouponApplicableToOrder = (coupon: any, items: any[], subtotal: number) => {
  const type = getCouponType(coupon);

  if (!type) {
    return false;
  }

  if (typeof coupon.min_amount === 'number' && subtotal < coupon.min_amount) {
    return false;
  }

  if (coupon.applicable_sku && Array.isArray(coupon.applicable_sku) && coupon.applicable_sku.length > 0) {
    const itemSkus = new Set(items.map((item) => item.sku));
    const matching = coupon.applicable_sku.filter((sku: string) => itemSkus.has(sku));
    if (matching.length === 0) {
      return false;
    }
  }

  if (type === 'percentage') {
    const value = Number(coupon.percentage ?? coupon.value ?? 0);
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }

  if (type === 'fixed_amount') {
    const value = Number(coupon.fixed_amount ?? coupon.value ?? 0);
    return Number.isFinite(value) && value >= 0;
  }

  if (type === 'n_for_m') {
    if (!coupon.sku && !coupon.product_sku) {
      return false;
    }

    const sku = String(coupon.sku ?? coupon.product_sku);
    const n = Number(coupon.n ?? 0);
    const m = Number(coupon.m ?? 0);

    return Number.isFinite(n) && Number.isFinite(m) && n > 0 && m > 0 && m <= n && !!items.find((item) => item.sku === sku);
  }

  return false;
};

const getEligibleItems = (coupon: any, items: any[]) => {
  const applicableSkus = coupon.applicable_sku && Array.isArray(coupon.applicable_sku) && coupon.applicable_sku.length > 0
    ? new Set(coupon.applicable_sku)
    : null;

  return items.filter((item) => {
    if (applicableSkus && !applicableSkus.has(item.sku)) {
      return false;
    }

    if (getCouponType(coupon) === 'n_for_m') {
      const sku = String(coupon.sku ?? coupon.product_sku ?? '');
      return item.sku === sku;
    }

    return true;
  });
};

const calculateCouponDiscount = (coupon: any, items: any[]) => {
  const type = getCouponType(coupon);
  const eligibleItems = getEligibleItems(coupon, items);
  const eligibleTotal = eligibleItems.reduce((sum, item) => sum + orderItemAmount(item.quantity, Number(item.unit_price)), 0);

  if (type === 'percentage') {
    const value = Number(coupon.percentage ?? coupon.value ?? 0);
    return eligibleItems.map((item) => {
      const amount = orderItemAmount(item.quantity, Number(item.unit_price));
      const discount = roundMoney((amount * value) / 100);
      return { sku: item.sku, discount: discount, itemAmount: amount };
    });
  }

  if (type === 'fixed_amount') {
    const fixedDiscount = Number(coupon.fixed_amount ?? coupon.value ?? 0);
    const totalDiscount = Math.min(fixedDiscount, eligibleTotal);
    let remaining = totalDiscount;

    return eligibleItems.map((item) => {
      const amount = orderItemAmount(item.quantity, Number(item.unit_price));
      const share = eligibleTotal > 0 ? (amount / eligibleTotal) * totalDiscount : 0;
      const discount = roundMoney(Math.min(share, remaining));
      remaining = roundMoney(Math.max(0, remaining - discount));
      return { sku: item.sku, discount: discount, itemAmount: amount };
    });
  }

  if (type === 'n_for_m') {
    const sku = String(coupon.sku ?? coupon.product_sku ?? '');
    const n = Number(coupon.n ?? 0);
    const m = Number(coupon.m ?? 0);
    const target = eligibleItems.filter((item) => item.sku === sku);

    return target.map((item) => {
      const unitPrice = Number(item.unit_price);
      const quantity = Number(item.quantity);
      const freeUnitsPerGroup = Math.max(0, n - m);
      const freeUnits = Math.floor(quantity / n) * freeUnitsPerGroup;
      const discount = roundMoney(unitPrice * freeUnits);
      return { sku: item.sku, discount: discount, itemAmount: orderItemAmount(quantity, unitPrice) };
    });
  }

  return [];
};

const selectBestCouponCombination = (coupons: any[], items: any[]) => {
  const subtotal = items.reduce((sum, item) => sum + orderItemAmount(item.quantity, Number(item.unit_price)), 0);
  const validCoupons = coupons.filter((coupon) => isCouponApplicableToOrder(coupon, items, subtotal));

  if (validCoupons.length === 0) {
    return {
      selectedCoupons: [],
      totalDiscount: 0,
      itemBreakdown: items.map((item) => ({
        sku: item.sku,
        discount: 0,
        itemAmount: orderItemAmount(item.quantity, Number(item.unit_price)),
      })),
    };
  }

  const candidateSets: any[][] = [];

  for (let mask = 1; mask < (1 << validCoupons.length); mask += 1) {
    const combo: any[] = [];

    for (let i = 0; i < validCoupons.length; i += 1) {
      if (mask & (1 << i)) {
        combo.push(validCoupons[i]);
      }
    }

    const hasNonStackable = combo.some((coupon) => coupon.stackable === false);
    if (hasNonStackable && combo.length > 1) {
      continue;
    }

    candidateSets.push(combo);
  }

  candidateSets.push([validCoupons[0]]);

  let bestSet: any[] = [];
  let bestDiscount = -1;
  let bestBreakdown: any[] = [];

  for (const combo of candidateSets) {
    const itemBreakdown = new Map<string, { sku: string; discount: number; itemAmount: number }>();

    for (const item of items) {
      itemBreakdown.set(item.sku, {
        sku: item.sku,
        discount: 0,
        itemAmount: orderItemAmount(item.quantity, Number(item.unit_price)),
      });
    }

    for (const coupon of combo) {
      const couponBreakdown = calculateCouponDiscount(coupon, items);
      for (const row of couponBreakdown) {
        const current = itemBreakdown.get(row.sku) ?? {
          sku: row.sku,
          discount: 0,
          itemAmount: orderItemAmount(
            Number(items.find((item) => item.sku === row.sku)?.quantity ?? 0),
            Number(items.find((item) => item.sku === row.sku)?.unit_price ?? 0),
          ),
        };
        current.discount = roundMoney(current.discount + row.discount);
        itemBreakdown.set(row.sku, current);
      }
    }

    const totalDiscount = Math.min(subtotal, Array.from(itemBreakdown.values()).reduce((sum, item) => sum + item.discount, 0));

    if (totalDiscount > bestDiscount) {
      bestDiscount = totalDiscount;
      bestSet = combo;
      bestBreakdown = Array.from(itemBreakdown.values());
    }
  }

  return {
    selectedCoupons: bestSet,
    totalDiscount: Math.max(0, bestDiscount),
    itemBreakdown: bestBreakdown.length ? bestBreakdown : items.map((item) => ({
      sku: item.sku,
      discount: 0,
      itemAmount: orderItemAmount(item.quantity, Number(item.unit_price)),
    })),
  };
};

router.post('/orders/:id/apply-discounts', async (req, res) => {
  try {
    const { id } = req.params;
    const coupons = Array.isArray(req.body?.coupons) ? req.body.coupons : [];

    if (!Array.isArray(coupons) || coupons.length === 0) {
      return res.status(400).json({ error: 'coupons must be a non-empty array' });
    }

    if (coupons.length > 30) {
      return res.status(400).json({ error: 'Maximum 30 coupons allowed' });
    }

    const orderResult = await pool.query(
      `
        SELECT o.id, o.order_ref, o.customer_email, o.status, o.created_at
        FROM orders o
        WHERE o.id::text = $1 OR o.order_ref = $1
      `,
      [id],
    );

    if (orderResult.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const itemsResult = await pool.query(
      `
        SELECT
          oi.sku,
          p.name AS product_name,
          oi.quantity,
          oi.unit_price,
          (oi.quantity * oi.unit_price) AS amount
        FROM order_items oi
        INNER JOIN products p ON p.sku = oi.sku
        WHERE oi.order_ref = $1
      `,
      [order.order_ref],
    );

    if (itemsResult.rowCount === 0) {
      return res.status(400).json({ error: 'Order has no items' });
    }

    if ((itemsResult.rowCount ?? 0) > 100) {
      return res.status(400).json({ error: 'Maximum 100 items allowed' });
    }

    const items = itemsResult.rows.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      amount: Number(item.amount),
    }));

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const selected = selectBestCouponCombination(coupons, items);

    const appliedCoupons = selected.selectedCoupons.map((coupon) => coupon.code ?? coupon.id ?? 'coupon');

    const responseItems = items.map((item) => {
      const matched = selected.itemBreakdown.find((breakdown) => breakdown.sku === item.sku);
      const itemAmount = orderItemAmount(item.quantity, item.unit_price);
      const discount = matched ? matched.discount : 0;
      const finalAmount = roundMoney(Math.max(0, itemAmount - discount));

      return {
        product_id: item.sku,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unit_price.toFixed(2),
        amount: itemAmount.toFixed(2),
        discount: discount.toFixed(2),
        final_amount: finalAmount.toFixed(2),
        coupons: appliedCoupons,
      };
    });

    const total = roundMoney(Math.max(0, subtotal - selected.totalDiscount));

    return res.json({
      order_id: Number(order.id),
      subtotal: subtotal.toFixed(2),
      applied_coupons: appliedCoupons,
      total_discount: selected.totalDiscount.toFixed(2),
      total: total.toFixed(2),
      items: responseItems,
    });
  } catch (error) {
    console.error('POST /orders/:id/apply-discounts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
