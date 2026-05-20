// public/js/tracking-ui.js
(function (global) {
  const ORDER_STATUS_LABELS = {
    pending: "Pending",
    confirmed: "Confirmed",
    processing: "Processing",
    shipped: "Shipped",
    delivered: "Delivered",
    partially_returned: "Partially returned",
    returned: "Returned",
    cancelled: "Cancelled",
  };

  const RETURN_STATUS_LABELS = {
    pending: "Request sent",
    approved: "Approval",
    picked_up: "Picked up",
    received: "Received",
    refunded: "Refunded",
    rejected: "Rejected",
  };

  const DEFAULT_ORDER_STEPS = [
    { key: "pending", label: "Pending", status: "upcoming" },
    { key: "confirmed", label: "Confirmed", status: "upcoming" },
    { key: "processing", label: "Processing", status: "upcoming" },
    { key: "shipping", label: "Shipping", status: "upcoming" },
    { key: "delivery", label: "Delivery", status: "upcoming" },
  ];

  const DEFAULT_RETURN_STEPS = [
    { key: "request_sent", label: "Request Sent", status: "upcoming" },
    { key: "approval", label: "Approval", status: "upcoming" },
    { key: "pickup", label: "Pickup", status: "upcoming" },
    { key: "refund", label: "Refund", status: "upcoming" },
  ];

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");

  function orderStatusClass(status) {
    if (status === "delivered" || status === "partially_returned") return "os-delivered";
    if (status === "shipped") return "os-shipped";
    if (status === "processing") return "os-assigned";
    if (status === "confirmed") return "os-confirmed";
    return "os-pending";
  }

  function returnStatusClass(status) {
    return `rs-${status || "pending"}`;
  }

  /**
   * Horizontal stepper — prefers API tracking.steps; falls back to status mapping.
   */
  function renderStepper(steps, { rejected = false, showLabels = true } = {}) {
    if (rejected) {
      return `<div class="track-rejected">Request rejected</div>`;
    }
    const list = steps?.length ? steps : DEFAULT_ORDER_STEPS;
    const activeIdx = list.findIndex((s) => s.status === "active");
    const idx = activeIdx >= 0 ? activeIdx : 0;

    const nodes = list
      .map((step, i) => {
        const done = step.status === "completed" || (activeIdx < 0 && i < idx);
        const active = step.status === "active" || i === idx;
        const num = String(i + 1).padStart(2, "0");
        const inner = done
          ? "✓"
          : showLabels
            ? num
            : String(i + 1);
        const label = showLabels
          ? `<span class="track-step-label">${esc(step.label)}</span>`
          : "";
        return `<div class="track-step ${done ? "done" : active ? "active" : ""}">
        ${i > 0 ? '<div class="track-step-line"></div>' : ""}
        <div class="track-step-node">
          <div class="track-step-circle" title="${esc(step.label)}">${inner}</div>
          ${label}
        </div>
      </div>`;
      })
      .join("");

    return `<div class="track-stepper">${nodes}</div>`;
  }

  function refundStatusToStep(status) {
    switch (status) {
      case "pending":
        return "request_sent";
      case "approved":
        return "approval";
      case "picked_up":
      case "received":
        return "pickup";
      case "refunded":
        return "refund";
      default:
        return "request_sent";
    }
  }

  function orderStatusToStep(status) {
    switch (status) {
      case "pending":
        return "pending";
      case "confirmed":
        return "confirmed";
      case "processing":
        return "processing";
      case "shipped":
        return "shipping";
      case "delivered":
      case "partially_returned":
      case "returned":
        return "delivery";
      default:
        return "pending";
    }
  }

  function renderOrderTracker(order) {
    const steps = order?.tracking?.steps?.length
      ? order.tracking.steps
      : buildStepper(DEFAULT_ORDER_STEPS, order?.tracking?.currentStep || orderStatusToStep(order?.orderStatus));
    return renderStepper(steps, { showLabels: true });
  }

  function renderReturnTracker(returnRequest) {
    const rejected = returnRequest?.refundStatus === "rejected";
    const steps = returnRequest?.tracking?.steps?.length
      ? returnRequest.tracking.steps
      : buildStepper(
          DEFAULT_RETURN_STEPS,
          returnRequest?.tracking?.currentStep ||
            refundStatusToStep(returnRequest?.refundStatus),
        );
    return renderStepper(steps, { rejected, showLabels: true });
  }

  function orderStatusLabel(status) {
    return ORDER_STATUS_LABELS[status] || status || "—";
  }

  function returnStatusLabel(status) {
    return RETURN_STATUS_LABELS[status] || (status || "").replace(/_/g, " ");
  }

  /** Banner under stepper (shipping message + tracking number). */
  function renderOrderStatusBanner(order) {
    const step = order?.tracking?.currentStep;
    const tn =
      order?.tracking?.trackingNumber ||
      order?.fulfillment?.trackingNumber ||
      null;
    const bosta = order?.tracking?.bostaState || order?.fulfillment?.bostaState;

    let msg = "We're preparing your order.";
    if (step === "confirmed") msg = "Your order is confirmed.";
    else if (step === "processing") msg = "Your order is being prepared.";
    else if (step === "shipping") msg = "Your order is on its way!";
    else if (step === "delivery") msg = "Your order has been delivered.";

    const parts = [`<div class="track-banner"><i class="ti ti-truck-delivery"></i><div>`];
    parts.push(`<strong>${esc(msg)}</strong>`);
    if (tn) {
      parts.push(
        `<div class="track-banner-meta">Tracking: <span class="track-mono">${esc(tn)}</span></div>`,
      );
    }
    if (bosta) {
      parts.push(
        `<div class="track-banner-meta">Carrier: ${esc(bosta)}</div>`,
      );
    }
    parts.push("</div></div>");
    return parts.join("");
  }

  function canAssignOrder(order) {
    return (
      ["pending", "confirmed", "processing"].includes(order?.orderStatus) &&
      !order?.fulfillment?.carrier
    );
  }

  function needsConfirmOrder(order) {
    return order?.orderStatus === "pending";
  }

  global.OxxilaTracking = {
    ORDER_STATUS_LABELS,
    RETURN_STATUS_LABELS,
    esc,
    orderStatusClass,
    returnStatusClass,
    orderStatusLabel,
    returnStatusLabel,
    renderStepper,
    renderOrderTracker,
    renderReturnTracker,
    renderOrderStatusBanner,
    canAssignOrder,
    needsConfirmOrder,
  };
})(typeof window !== "undefined" ? window : globalThis);
