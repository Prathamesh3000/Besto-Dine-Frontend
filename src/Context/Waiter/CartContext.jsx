// Moved to Context/CartContext.jsx — the store is shared by the customer
// and waiter flows. This shim keeps old imports working.
// eslint-disable-next-line react-refresh/only-export-components
export { CartProvider, useCart } from '../CartContext';
