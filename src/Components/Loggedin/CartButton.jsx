import React, { useState, useEffect } from 'react';
import { ShoppingCart, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../Context/CartContext';
import useCustomerSession from '../../hooks/useCustomerSession';

function CartButton() {
  const navigate = useNavigate();
  const location = useLocation();
  /* 
    The new Context/CartContext returns:
    { cartItems: {}, updateQuantity, totalItems, totalPrice, ... }
    cartItems is an object { [id]: { ... }, ... }
  */
  const { totalItems, totalPrice } = useCart();
  // Settled dine-in visit (bill paid) — no "View Cart" until re-scan.
  const { isSettled } = useCustomerSession();

  const [justAdded, setJustAdded] = useState(false);
  const [prevTotalItems, setPrevTotalItems] = useState(0);

  // Track changes to trigger animation
  useEffect(() => {
    if (totalItems > prevTotalItems) {
      setJustAdded(true);
      const timer = setTimeout(() => setJustAdded(false), 300);
      return () => clearTimeout(timer);
    }
    setPrevTotalItems(totalItems);
  }, [totalItems]);

  // Hide button if no items, the visit is settled, OR if on cart page
  if (totalItems === 0 || (isSettled && !location.pathname.startsWith('/waiter')) || location.pathname === '/customer/cart' || location.pathname === '/customer/payment' || location.pathname === '/customer/orders' || location.pathname === '/customer/receipt' || location.pathname === '/login') return null;

  // Route by WHERE the user is, not what role they hold. A staff
  // member browsing the customer menu should still land on the
  // customer cart, and vice versa. The cart items they just added
  // belong to the view they were in.
  const inWaiterView = location.pathname.startsWith('/waiter');
  const cartPath = inWaiterView ? '/waiter/cart' : '/customer/cart';

  return (
    <div
      // Sit ABOVE BottomNavCustomer (which is fixed bottom-0 ~60px tall
      // at z-50). A previous `bottom-4` variant for `/customer/item/...`
      // pushed this button UNDER the bottom nav, making it invisible on
      // category-browse routes even though the cart had items.
      className={`fixed left-0 right-0 xl:left-[300px] xl:right-[300px] bottom-22 z-40 transition-all duration-500 ease-out ${justAdded ? 'scale-105' : 'scale-100'}`}
      style={{
        animation: totalItems === 1 ? 'slide-up 0.5s ease-out' : 'none'
      }}
    >
      <div className="px-4 py-2 sm:px-5">
        <button
          onClick={() => navigate(cartPath)}
          className="w-full bg-orange-500 text-[#FFFFFF] nunito py-3 sm:py-4 rounded-xl shadow-lg flex items-center justify-between px-4 sm:px-6 active:scale-[0.98] transition-transform hover:bg-orange-600"
        >
          <div className="flex items-center gap-2">
            <i className="fi fi-rr-shopping-cart w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-sm sm:text-base">{totalItems} {totalItems === 1 ? "item" : "items"} added</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base">View Cart</span>
            <i className="fi fi-rr-angle-small-right w-4 h-4 " />
          </div>
        </button>
      </div>


    </div>
  );
}

export default CartButton;