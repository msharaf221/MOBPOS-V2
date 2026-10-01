import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StoreState } from './types';
import { useStoreDispatcher } from './useStoreDispatcher';
import { validText } from './helpers';
import { Category } from '../../types';

export function useCategoriesSlice(state: StoreState) {
  const { categories } = state;
  const dispatch = useStoreDispatcher(state);

  const addCategory = useCallback((category: Omit<Category, 'id'>) => {
    if (!validText(category.name, 200) || !['device', 'accessory', 'spare_part'].includes(category.type)) return null;
    if (categories.some(c => c.name.trim().toLowerCase() === category.name.trim().toLowerCase())) return null;
    
    const newCategory: Category = { name: category.name.trim(), type: category.type, id: uuidv4() };
    dispatch({ deltas: [{ type: 'upsert', storeName: 'categories', items: [newCategory] }] });
    return newCategory;
  }, [categories, dispatch]);

  return { addCategory };
}
