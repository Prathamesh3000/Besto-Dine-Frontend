// Pay screen: what to tell the customer when the payment could not even be
// STARTED (the create-order call failed, or the gateway never opened).
//
// Nothing has been charged and no order exists at that point — the cafe order is
// only created after the gateway captures — so every message says so. The raw
// server text ("Failed to create payment order") and status codes stay in the
// console; the customer gets a title, one plain sentence and the reassurance.
const REASSURE = 'Nothing was charged and your order has not been placed.';

export function describePaymentInitError(err) {
  const status = err?.response?.status;
  const offline = err?.code === 'ERR_NETWORK' || err?.message === 'Network Error';

  if (offline) {
    return {
      title: "Can't reach the payment service",
      message: `Check your internet connection and try again. ${REASSURE}`,
    };
  }
  if (status === 429) {
    return {
      title: 'Payments are busy right now',
      message: `Please wait a minute and try again. ${REASSURE}`,
    };
  }
  return {
    title: "We couldn't start the payment",
    message: `Please try again. If it keeps happening, ask the staff for help. ${REASSURE}`,
  };
}
