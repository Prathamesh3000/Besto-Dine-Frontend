import React, { useState, useEffect } from 'react';
import { ChevronLeft, Clock, Users, Bookmark, Plus, Minus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { routes } from '../../App';
import Header from '@components/layout/Header/Header';
import BottomNav from '@components/layout/BottomNav/BottomNav';
import { useCart } from '@hooks/useCart';

// Menu Item Component for Bookmarks with counter
const MenuItem = ({ title, desc, price, image, time, serves, isVeg, onAddToCart, onClick, id, quantity = 0, onIncrease, onDecrease }) => {
  return (
    <div 
      onClick={onClick}
      className="flex gap-4 p-3 md:p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-[0_2px_15px_rgba(0,0,0,0.04)] mb-[10px] md:mb-4 cursor-pointer active:scale-[0.99] transition-transform"
    >
      {/* Image Section */}
      <div className="relative w-28 h-28 md:w-32 md:h-32 flex-shrink-0">
        <img 
          src={image} 
          alt={title} 
          className="w-full h-full object-cover rounded-xl" 
          onError={(e) => {
            e.target.src = 'https://placehold.co/200x200?text=Image+Not+Found';
          }}
        />
        {isVeg !== undefined && (
          <div className="absolute top-2 left-2 w-4 h-4 bg-white rounded flex items-center justify-center p-0.5">
            <div className={`w-full h-full border ${isVeg ? 'border-green-600' : 'border-red-600'} rounded-sm flex items-center justify-center`}>
              <div className={`w-1.5 h-1.5 ${isVeg ? 'bg-green-600' : 'bg-red-600'} rounded-full`}></div>
            </div>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className="flex-1 flex flex-col justify-between py-1">
        <div>
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-gray-800 dark:text-white text-base md:text-lg leading-tight mb-1">{title}</h3>
            <Bookmark size={16} className="text-orange-500 fill-current flex-shrink-0 md:w-5 md:h-5" />
          </div>
          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{desc}</p>
          <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500 font-medium">
            <span className="flex items-center gap-1"><Clock size={12} /> {time}</span>
            <span className="flex items-center gap-1"><Users size={12} className="mr-1" /> {serves}</span>
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-2">
          <span className="font-bold text-lg md:text-xl text-gray-800 dark:text-white">₹{typeof price === 'number' ? price.toFixed(2) : price}</span>
          {quantity > 0 ? (
            <div className="flex items-center gap-2 sm:gap-3 bg-orange-50 dark:bg-orange-900/30 rounded-lg px-2 py-1 border border-orange-200 dark:border-orange-700">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDecrease && onDecrease();
                }}
                className="text-orange-600 dark:text-orange-400 font-bold w-6 h-6 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Minus size={16} />
              </button>
              <span className="font-bold text-sm md:text-base w-5 text-center text-gray-800 dark:text-white">{quantity}</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onIncrease && onIncrease();
                }}
                className="text-orange-600 dark:text-orange-400 font-bold w-6 h-6 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Plus size={16} />
              </button>
            </div>
          ) : (
            <button 
              className="bg-orange-500 text-white px-6 py-1.5 md:px-7 md:py-2 rounded-lg text-sm md:text-base font-semibold shadow-sm active:scale-95 transition-transform flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart({ id, title, desc, price, image, isVeg, quantity: 1, size: 'regular', toppings: [], time, serves });
              }}
              aria-label={`Add ${title} to cart`}
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

function Bookmarks() {
  const navigate = useNavigate();
  const { addItem, items: cartItems, updateQuantity } = useCart();
  const [bookmarkedItems, setBookmarkedItems] = useState([]);

  // Get quantity of item in cart
  const getItemQuantity = (itemId) => {
    const cartItem = cartItems.find(item => item.id === itemId);
    return cartItem ? cartItem.quantity : 0;
  };

  // Handle increasing quantity
  const handleIncreaseQuantity = (item) => {
    const existingIndex = cartItems.findIndex(cartItem => cartItem.id === item.id);
    if (existingIndex >= 0) {
      updateQuantity(existingIndex, cartItems[existingIndex].quantity + 1);
    }
  };

  // Handle decreasing quantity
  const handleDecreaseQuantity = (item) => {
    const existingIndex = cartItems.findIndex(cartItem => cartItem.id === item.id);
    if (existingIndex >= 0) {
      updateQuantity(existingIndex, cartItems[existingIndex].quantity - 1);
    }
  };

  // Load bookmarked items from localStorage
  useEffect(() => {
    const savedBookmarks = JSON.parse(localStorage.getItem('bookmarkedItems') || '{}');
    
    // Extract the actual item details from the stored bookmark entries
    const bookmarkedItemsWithDetails = Object.entries(savedBookmarks)
      .filter(([id, entry]) => {
        // Check if the entry is an object with bookmarked=true, or a boolean true
        return typeof entry === 'object' ? entry.bookmarked : !!entry;
      })
      .map(([id, entry]) => {
        // If it's an object with details, use those; otherwise create a basic object
        if (typeof entry === 'object' && entry.bookmarked) {
          return {
            id: parseInt(id) || id,
            ...entry
          };
        } else {
          return {
            id: parseInt(id) || id,
            title: `Bookmarked Item ${id}`,
            desc: "Description of the bookmarked item",
            price: 0,
            image: "https://placehold.co/200x200?text=Item+Image",
            time: "--",
            serves: "--",
            isVeg: true
          };
        }
      });
    
    setBookmarkedItems(bookmarkedItemsWithDetails);
  }, []);

  const handleAddToCart = (item) => {
    const cartItem = {
      id: item.id,
      title: item.title,
      price: item.price,
      image: item.image,
      isVeg: item.isVeg,
      quantity: 1,
      size: 'regular',
      toppings: [],
    };
    
    addItem(cartItem);
    console.log(`${item.title} added to cart`);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-900 pb-24 transition-colors duration-200">
      <Header />
      
      <main className="flex flex-col gap-6 pt-4 px-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition-transform"
            aria-label="Go back"
          >
            <ChevronLeft size={24} className="text-gray-800 dark:text-white" />
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white">Saved Items</h1>
        </div>

        {/* Bookmarks List */}
        <section>
          {bookmarkedItems.length > 0 ? (
            <div className="space-y-4">
              {bookmarkedItems.map((item) => (
                <MenuItem 
                  key={item.id}
                  {...item}
                  onAddToCart={handleAddToCart}
                  onClick={() => navigate(routes.PRODUCT_DETAILS.replace(':id', item.id), { state: { product: item } })}
                  quantity={getItemQuantity(item.id)}
                  onIncrease={() => handleIncreaseQuantity(item)}
                  onDecrease={() => handleDecreaseQuantity(item)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Bookmark size={48} className="text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white mb-2">No saved items yet</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">Items you bookmark will appear here</p>
              <button 
                onClick={() => navigate('/home')}
                className="bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
              >
                Browse Menu
              </button>
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}

export default Bookmarks;