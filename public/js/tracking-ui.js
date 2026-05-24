// public/js/tracking-ui.js
(function (global) {
  const ORDER_STATUS_LABELS = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    processing: 'Processing',
    shipped: 'Shipped',
    delivered: 'Delivered',
    partially_returned: 'Partially returned',
    returned: 'Returned',
    cancelled: 'Cancelled',
  };

  const PHASE_LABELS = {
    placed: 'Order placed',
    handed_over: 'Picked up',
    in_transit: 'On the way',
    out_for_delivery: 'On the way',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };

  const DEFAULT_ORDER_STEPS = [
    { key: 'placed', label: 'Order placed', status: 'upcoming' },
    { key: 'handed_over', label: 'Picked up', status: 'upcoming' },
    { key: 'in_transit', label: 'On the way', status: 'upcoming' },
    { key: 'delivered', label: 'Delivered', status: 'upcoming' },
  ];

  const RETURN_STATUS_LABELS = {
    pending: 'Pending review',
    approved: 'Approved',
    picked_up: 'Picked up',
    received: 'Received',
    refunded: 'Refunded',
    rejected: 'Rejected',
  };

  const DEFAULT_RETURN_STEPS = [
    { key: 'pending', label: 'Submitted' },
    { key: 'approved', label: 'Approved' },
    { key: 'picked_up', label: 'Picked up' },
    { key: 'received', label: 'Received' },
    { key: 'refunded', label: 'Refunded' },
  ];

  const RETURN_STATUS_INDEX = {
    pending: 0,
    approved: 1,
    picked_up: 2,
    received: 3,
    refunded: 4,
  };

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');

  function orderStatusClass(status) {
    if (status === 'delivered') return 'os-delivered';
    if (status === 'partially_returned') return 'os-partial-return';
    if (status === 'returned') return 'os-product-returned';
    if (status === 'shipped') return 'os-shipped';
    if (status === 'processing') return 'os-assigned';
    if (status === 'confirmed') return 'os-confirmed';
    return 'os-pending';
  }

  function buildStepper(steps, activeKey) {
    const activeOrder =
      steps.find((s) => s.key === activeKey)?.order ??
      DEFAULT_ORDER_STEPS.find((s) => s.key === activeKey)?.order ??
      99;
    return (steps.length ? steps : DEFAULT_ORDER_STEPS).map((step, i) => {
      const order = step.order ?? i + 1;
      const done = step.status === 'completed';
      const active = step.status === 'active';
      return { ...step, order, status: done ? 'completed' : active ? 'active' : 'upcoming' };
    });
  }

  function renderStepper(steps, { showLabels = true } = {}) {
    const list = steps?.length ? steps : DEFAULT_ORDER_STEPS;
    const activeIdx = list.findIndex((s) => s.status === 'active');
    const idx = activeIdx >= 0 ? activeIdx : 0;

    const nodes = list
      .map((step, i) => {
        const done = step.status === 'completed' || (activeIdx < 0 && i < idx);
        const active = step.status === 'active' || i === idx;
        const num = String(i + 1).padStart(2, '0');
        const inner = done ? '✓' : showLabels ? num : String(i + 1);
        const label = showLabels
          ? `<span class="track-step-label">${esc(step.label)}</span>`
          : '';
        return `<div class="track-step ${done ? 'done' : active ? 'active' : ''}">
        ${i > 0 ? '<div class="track-step-line"></div>' : ''}
        <div class="track-step-node">
          <div class="track-step-circle" title="${esc(step.label)}">${inner}</div>
          ${label}
        </div>
      </div>`;
      })
      .join('');

    return `<div class="track-stepper">${nodes}</div>`;
  }

  function renderOrderTracker(order) {
    const steps = order?.tracking?.steps?.length ? order.tracking.steps : DEFAULT_ORDER_STEPS;
    return renderStepper(steps, { showLabels: true });
  }

  function orderStatusLabel(status) {
    return ORDER_STATUS_LABELS[status] || status || '—';
  }

  function renderOrderStatusBanner(order) {
    const phase = order?.tracking?.phase;
    const tn = order?.tracking?.trackingNumber ?? null;
    const carrierLabel = order?.tracking?.carrierStatusLabel;
    const payLabel = order?.paymentStatusLabel;
    const isPaid = order?.isPaid === true;

    const msg =
      order?.orderStatusLabel ||
      order?.tracking?.phaseLabel ||
      PHASE_LABELS[phase] ||
      "We're preparing your order.";

    const parts = [
      `<div class="track-banner"><i class="ti ti-truck-delivery"></i><div>`,
    ];
    parts.push(`<strong>${esc(msg)}</strong>`);
    if (payLabel) {
      parts.push(
        `<div class="track-banner-meta"><span class="pay-badge ${isPaid ? 'pay-paid' : 'pay-unpaid'}">${esc(payLabel)}</span></div>`
      );
    }
    if (tn) {
      parts.push(
        `<div class="track-banner-meta">Tracking: <span class="track-mono">${esc(tn)}</span></div>`
      );
    }
    if (carrierLabel) {
      parts.push(`<div class="track-banner-meta">${esc(carrierLabel)}</div>`);
    }
    parts.push('</div></div>');
    return parts.join('');
  }

  function isCommittedShipment(shipment) {
    if (!shipment?.carrier && !shipment?.carrierName) return false;
    if (shipment.carrierType === 'api') {
      return Boolean(shipment.externalDeliveryId);
    }
    if (shipment.carrierType === 'known' || shipment.carrierType === 'internal') {
      return Boolean(shipment.trackingNumber);
    }
    return Boolean(shipment.externalDeliveryId || shipment.trackingNumber);
  }

  function canAssignOrder(order) {
    return (
      ['pending', 'confirmed', 'processing'].includes(order?.orderStatus) &&
      !isCommittedShipment(order?.shipment)
    );
  }

  function needsConfirmOrder(order) {
    return order?.orderStatus === 'pending';
  }

  function returnStatusLabel(status) {
    return RETURN_STATUS_LABELS[status] || status || '—';
  }

  function returnStepsFromStatus(refundStatus) {
    if (refundStatus === 'rejected') {
      return [{ key: 'rejected', label: 'Rejected', status: 'active' }];
    }
    if (refundStatus === 'refunded') {
      return DEFAULT_RETURN_STEPS.map((step) => ({ ...step, status: 'completed' }));
    }
    const idx = RETURN_STATUS_INDEX[refundStatus] ?? 0;
    return DEFAULT_RETURN_STEPS.map((step, i) => ({
      ...step,
      status: i < idx ? 'completed' : i === idx ? 'active' : 'upcoming',
    }));
  }

  function renderReturnTracker(returnRequest) {
    const steps = returnStepsFromStatus(returnRequest?.refundStatus || 'pending');
    return renderStepper(steps, { showLabels: true });
  }

  global.OxxilaTracking = {
    ORDER_STATUS_LABELS,
    PHASE_LABELS,
    esc,
    orderStatusClass,
    orderStatusLabel,
    renderStepper,
    renderOrderTracker,
    renderOrderStatusBanner,
    canAssignOrder,
    needsConfirmOrder,
    RETURN_STATUS_LABELS,
    returnStatusLabel,
    renderReturnTracker,
  };
})(typeof window !== 'undefined' ? window : globalThis);
