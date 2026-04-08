// src/components/SearchSuggestions.tsx

import type { Product } from '../types';
import './SearchSuggestions.css';

interface Props {
  suggestions: Product[];
  onSelect: (product: Product) => void;
}

const SearchSuggestions = ({ suggestions, onSelect }: Props) => {
  return (
    <ul className="suggestions-list">
      {suggestions.map(product => (
        <li 
          key={product.id} 
          onMouseDown={() => onSelect(product)}
        >
          <div className="suggestion-name">{product.name}</div>
          <div className="suggestion-details">
            <span>Cód: {product.id}</span>
            {product.sku && product.sku !== `ID-${product.id}` && <span>Barras: {product.sku}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
};

export default SearchSuggestions;