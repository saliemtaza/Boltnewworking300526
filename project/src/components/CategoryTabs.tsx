import { useRef, useEffect } from 'react';
import { Category } from '../lib/supabase';
import { Star } from 'lucide-react';

interface CategoryTabsProps {
  categories: Category[];
  selectedCategory: Category | null;
  onSelectCategory: (category: Category) => void;
  favoritesCount: number;
  showFavorites: boolean;
  onToggleFavorites: () => void;
}

export function CategoryTabs({ categories, selectedCategory, onSelectCategory, favoritesCount, showFavorites, onToggleFavorites }: CategoryTabsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedCategory && scrollContainerRef.current) {
      const activeButton = scrollContainerRef.current.querySelector(`[data-category-id="${selectedCategory.id}"]`);
      if (activeButton) {
        activeButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedCategory]);

  return (
    <div className="mb-4">
      <div
        ref={scrollContainerRef}
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
      >
        {/* Favorites Tab */}
        <button
          onClick={onToggleFavorites}
          className={`shrink-0 px-4 py-2 rounded-full font-semibold text-sm transition-all snap-start flex items-center gap-1.5 ${
            showFavorites
              ? 'bg-amber-500 text-slate-900'
              : 'bg-white text-slate-700 border border-slate-200 hover:border-amber-400'
          }`}
        >
          <Star size={14} fill={showFavorites ? 'currentColor' : 'none'} />
          MY REGULARS
          {favoritesCount > 0 && (
            <span className={`text-[10px] font-bold ${showFavorites ? 'text-slate-900' : 'text-amber-600'}`}>
              ({favoritesCount})
            </span>
          )}
        </button>

        {categories.map((category) => (
          <button
            key={category.id}
            data-category-id={category.id}
            onClick={() => { onSelectCategory(category); }}
            className={`shrink-0 px-4 py-2 rounded-full font-semibold text-sm transition-all snap-start ${
              selectedCategory?.id === category.id && !showFavorites
                ? 'bg-amber-500 text-slate-900'
                : 'bg-white text-slate-700 border border-slate-200 hover:border-amber-400'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  );
}
