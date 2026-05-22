// src/utils/returns/lines.js

export const getOrderLineKey = (item, index) =>
  item?._id ? String(item._id) : `idx:${index}`;

export const resolveOrderLine = (order, orderItemId) => {
  const sid = String(orderItemId ?? '').trim();
  let line = order.items.find((i) => i._id && String(i._id) === sid);
  if (line) return line;

  const indexMatch = sid.match(/^(?:idx:)?(\d+)$/);
  if (indexMatch) {
    const idx = Number(indexMatch[1]);
    if (Number.isInteger(idx) && order.items[idx]) return order.items[idx];
  }

  return null;
};
