import { useState, useMemo, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, Package, AlertTriangle, AlertCircle, FileSpreadsheet, Barcode as BarcodeIcon, Printer, Wand2 } from 'lucide-react';
import { InventoryItem, Category, IMEIUnit, Supplier, StockWaste } from '../types';
import { downloadExcel } from '../utils/reports';
import { generateBarcode, printBarcodeSticker } from '../utils/barcode';
import { buildImeiStockIndex } from '../utils/stockCounts';
import { formatCurrency } from '../utils/format';
import { usePagination } from '../hooks/usePagination';
import PaginationBar from './PaginationBar';

interface InventoryProps {
  inventory: InventoryItem[];
  categories: Category[];
  imeiUnits: IMEIUnit[];
  suppliers: Supplier[];
  onAddItem: (item: Omit<InventoryItem, 'id' | 'createdAt'>) => InventoryItem | null;
  onUpdateItem: (id: string, updates: Partial<InventoryItem>) => { ok: boolean; error?: string } | void;
  onDeleteItem: (id: string) => { ok: boolean; error?: string };
  onAddCategory: (category: Omit<Category, 'id'>) => void;
  onRecordWaste: (inventoryId: string, quantity: number, supplierId: string, reason: string, notes: string) => StockWaste | null;
}

export default function Inventory({
  inventory,
  categories,
  imeiUnits,
  suppliers,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onAddCategory,
  onRecordWaste
}: InventoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [wasteItem, setWasteItem] = useState<InventoryItem | null>(null);
  const [printBarcodeItem, setPrintBarcodeItem] = useState<InventoryItem | null>(null);
  const [barcodeCopies, setBarcodeCopies] = useState<number>(1);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    barcode: '',
    categoryId: '',
    costPrice: 0,
    sellPrice: 0,
    quantity: 0,
    minQuantity: 5,
    hasIMEI: false
  });

  const [newCategory, setNewCategory] = useState({ name: '', type: 'accessory' as 'device' | 'accessory' | 'spare_part' });
  const [wasteForm, setWasteForm] = useState({ quantity: 1, supplierId: '', reason: 'تالف', notes: '' });

  // كمية IMEI المتاحة: فهرس واحد لكل ريندر بدل مسح قائمة الـ IMEI لكل صف
  // (كان الجدول بيعمل مسحين لكل منتج: واحد للكمية وواحد لتانية داخل isLowStock).
  const imeiStock = useMemo(() => buildImeiStockIndex(imeiUnits), [imeiUnits]);
  // خريطة الفئات بدل categories.find داخل كل صف
  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  // Barcode generator helper
  const handleGenerateBarcode = () => {
    const code = generateBarcode(inventory.map(i => i.barcode));
    setFormData(prev => ({ ...prev, barcode: code }));
  };

  // Check if barcode is duplicate
  const isDuplicateBarcode = useMemo(() => {
    if (!formData.barcode.trim()) return false;
    return inventory.some(i => i.barcode && i.barcode.trim() === formData.barcode.trim() && (!selectedItem || i.id !== selectedItem.id));
  }, [formData.barcode, inventory, selectedItem]);

  // فحص تكرار الكود في الواجهة — المتجر بيرفض الكود المكرر بصمت، وده بيخلي
  // المستخدم يفتكر إن الزرار مااتضغطش.
  const isDuplicateCode = useMemo(() => {
    const code = formData.code.trim().toLowerCase();
    if (!code) return false;
    return inventory.some(i => i.code && i.code.trim().toLowerCase() === code && (!selectedItem || i.id !== selectedItem.id));
  }, [formData.code, inventory, selectedItem]);

  // Filter inventory — الحقول النصية بتتقرأ بعد `|| ''` لأن صفوف قديمة أو
  // مستوردة من ملف Backup ممكن تبقى من غير barcode/code خالص، و
  // undefined.includes() كانت ترمي error وتقفّل الجدول.
  const filteredInventory = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return inventory.filter(item => {
      const matchesSearch = term === '' ||
        item.name.toLowerCase().includes(term) ||
        (item.code || '').toLowerCase().includes(term) ||
        (item.barcode || '').includes(term);

      const matchesCategory = categoryFilter === 'all' || item.categoryId === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [inventory, searchTerm, categoryFilter]);

  // ===== تقسيم الصفحة =====
  // الجدول كان بيرسم المنتجات كلها في الـ DOM: كل صف = بحث في الفئات +
  // حساب كمية IMEI + تنسيق عملتين، وكل ده كان بيتعاد مع كل حرف في البحث.
  const productPagination = usePagination(filteredInventory, {
    defaultPageSize: 50,
    storageKey: 'mobpos_page_size_inventory'
  });
  const goToLastProductPage = () => productPagination.setPage(productPagination.totalPages);

  // أي تغيير في الفلاتر يرجّعك لأول نتيجة، مش لصفحة فاضية
  const resetProductPage = productPagination.resetPage;
  useEffect(() => {
    resetProductPage();
  }, [searchTerm, categoryFilter, resetProductPage]);

  // Get actual quantity for IMEI items — O(1) lookup في الفهرس
  const getActualQuantity = (item: InventoryItem) => imeiStock.availableStockOf(item);

  // Check if item is low stock
  const isLowStock = (item: InventoryItem) => getActualQuantity(item) <= item.minQuantity;

  const handleAdd = () => {
    if (!formData.name.trim() || !formData.categoryId) {
      alert('الاسم والفئة مطلوبان');
      return;
    }

    if (isDuplicateBarcode) {
      alert('الباركود مستخدم بالفعل في منتج آخر');
      return;
    }

    if (isDuplicateCode) {
      alert('الكود مستخدم بالفعل في منتج آخر — غيّره أو سيبه فاضي يتولّد تلقائيًا');
      return;
    }

    if (formData.costPrice < 0 || formData.sellPrice < 0 || formData.quantity < 0 || formData.minQuantity < 0) {
      alert('لا يمكن أن تكون الأسعار أو الكميات بقيم سالبة');
      return;
    }

    const created = onAddItem({
      name: formData.name.trim(),
      // الكود فاضي كان بيخلّي المتجر يرفض المنتج بصمت — بقى يتولّد تلقائيًا
      code: formData.code.trim(),
      barcode: formData.barcode.trim(),
      categoryId: formData.categoryId,
      costPrice: formData.costPrice,
      sellPrice: formData.sellPrice,
      quantity: formData.hasIMEI ? 0 : formData.quantity,
      minQuantity: formData.minQuantity,
      hasIMEI: formData.hasIMEI
    });

    // لو الرفض حصل في المتجر (مش في الواجهة) المستخدم لازم يعرف السبب،
    // والفورم يفضل مفتوح عشان التعديل ما يضيعش.
    if (!created) {
      alert('تعذّرت إضافة المنتج: اتأكد من الكود (غير مستخدم لمنتج تاني) ومن صحة الأسعار والكميات.');
      return;
    }

    setShowAddModal(false);
    resetForm();
    // نزود عدد الصفحات لحد ما المنتج الجديد يبان
    goToLastProductPage();
  };

  const handleEdit = () => {
    if (!selectedItem) return;

    if (isDuplicateBarcode) {
      alert('الباركود مستخدم بالفعل في منتج آخر');
      return;
    }

    if (isDuplicateCode) {
      alert('الكود مستخدم بالفعل في منتج آخر');
      return;
    }

    if (formData.costPrice < 0 || formData.sellPrice < 0 || formData.quantity < 0 || formData.minQuantity < 0) {
      alert('لا يمكن أن تكون الأسعار أو الكميات بقيم سالبة');
      return;
    }

    const result = onUpdateItem(selectedItem.id, {
      name: formData.name.trim(),
      code: formData.code.trim(),
      barcode: formData.barcode.trim(),
      categoryId: formData.categoryId,
      costPrice: formData.costPrice,
      sellPrice: formData.sellPrice,
      quantity: formData.hasIMEI ? selectedItem.quantity : formData.quantity,
      minQuantity: formData.minQuantity
    });

    // تحديث المنتج كان بيرفض بصمت لو الكود/الباركود مكرر — دلوقتي السبب بيظهر
    if (result && result.ok === false) {
      alert(result.error || 'تعذّر حفظ التعديلات');
      return;
    }

    setShowEditModal(false);
    setSelectedItem(null);
    resetForm();
  };

  const handleAddCategory = () => {
    if (!newCategory.name) {
      alert('اسم الفئة مطلوب');
      return;
    }

    onAddCategory(newCategory);
    setShowCategoryModal(false);
    setNewCategory({ name: '', type: 'accessory' });
  };

  const openEditModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setFormData({
      name: item.name,
      code: item.code,
      barcode: item.barcode,
      categoryId: item.categoryId,
      costPrice: item.costPrice,
      sellPrice: item.sellPrice,
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      hasIMEI: item.hasIMEI
    });
    setShowEditModal(true);
  };

  const openWasteModal = (item: InventoryItem) => {
    setWasteItem(item);
    setWasteForm({
      quantity: 1,
      supplierId: suppliers[0]?.id || '',
      reason: 'تالف',
      notes: ''
    });
    setShowWasteModal(true);
  };

  const handleRecordWaste = () => {
    if (!wasteItem) return;

    const actualQty = getActualQuantity(wasteItem);
    if (wasteForm.quantity <= 0 || wasteForm.quantity > actualQty) {
      alert('الكمية غير صحيحة');
      return;
    }

    const result = onRecordWaste(
      wasteItem.id,
      wasteForm.quantity,
      wasteForm.supplierId,
      wasteForm.reason,
      wasteForm.notes
    );

    if (!result) {
      alert('تعذر تسجيل الهوالك');
      return;
    }

    setShowWasteModal(false);
    setWasteItem(null);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      barcode: '',
      categoryId: '',
      costPrice: 0,
      sellPrice: 0,
      quantity: 0,
      minQuantity: 5,
      hasIMEI: false
    });
  };

  // Group by category type
  const categoryTypes = [
    { type: 'device', label: 'أجهزة' },
    { type: 'accessory', label: 'إكسسوارات' },
    { type: 'spare_part', label: 'قطع غيار' }
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">المخزون</h1>
          <p className="text-gray-500 dark:text-gray-400">إدارة المنتجات والكميات</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() =>
              downloadExcel(
                `inventory-${new Date().toISOString().slice(0, 10)}`,
                ['الصنف', 'الكود', 'الباركود', 'الفئة', 'سعر الشراء', 'سعر البيع', 'الكمية', 'الحد الأدنى', 'قيمة المخزون'],
                inventory.map(i => {
                  const actualQty = getActualQuantity(i);
                  return [
                    i.name, i.code, i.barcode,
                    categoryById.get(i.categoryId)?.name || '',
                    i.costPrice, i.sellPrice, actualQty, i.minQuantity,
                    i.costPrice * actualQty,
                  ];
                })
              )
            }
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition"
          >
            <FileSpreadsheet size={20} />
            تصدير Excel
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition"
          >
            <Plus size={20} />
            فئة جديدة
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus size={20} />
            منتج جديد
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالاسم أو الكود أو الباركود..."
              className="w-full py-2 pr-10 pl-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="py-2 px-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
          >
            <option value="all">جميع الفئات</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
              <Package className="text-blue-600 dark:text-blue-400" size={20} />
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">إجمالي المنتجات</p>
              <p className="text-xl font-bold text-gray-800 dark:text-white">{inventory.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center">
              <Package className="text-green-600 dark:text-green-400" size={20} />
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">أجهزة متاحة</p>
              <p className="text-xl font-bold text-green-600">
                {imeiUnits.filter(u => u.status === 'available').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-yellow-600 dark:text-yellow-400" size={20} />
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">مخزون منخفض</p>
              <p className="text-xl font-bold text-yellow-600">
                {inventory.filter(i => isLowStock(i)).length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center">
              <Package className="text-purple-600 dark:text-purple-400" size={20} />
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">الفئات</p>
              <p className="text-xl font-bold text-purple-600">{categories.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">المنتج</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الكود</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الباركود</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الفئة</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">سعر الشراء</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">سعر البيع</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الكمية</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">النوع</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {productPagination.pageRows.map(item => {
                const category = categoryById.get(item.categoryId);
                const actualQty = getActualQuantity(item);
                const lowStock = isLowStock(item);

                return (
                  <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${lowStock ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {lowStock && <AlertTriangle className="text-yellow-500" size={16} />}
                        <span className="font-medium text-gray-800 dark:text-white">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-600 dark:text-gray-400">
                      {item.code || '-'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {item.barcode ? (
                        <div className="flex items-center gap-1.5">
                          <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded font-bold">{item.barcode}</span>
                          <button
                            onClick={() => { setPrintBarcodeItem(item); setBarcodeCopies(1); }}
                            className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                            title="طباعة ملصق باركود"
                          >
                            <BarcodeIcon size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        category?.type === 'device' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                        category?.type === 'accessory' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                      }`}>
                        {category?.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {formatCurrency(item.costPrice)}
                    </td>
                    <td className="px-4 py-3 text-gray-800 dark:text-white font-medium">
                      {item.sellPrice > 0 ? formatCurrency(item.sellPrice) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold ${lowStock ? 'text-red-600' : 'text-gray-800 dark:text-white'}`}>
                        {actualQty}
                      </span>
                      {item.hasIMEI && (
                        <span className="text-xs text-gray-500 mr-1">(IMEI)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        item.hasIMEI ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                      }`}>
                        {item.hasIMEI ? 'جهاز' : 'عادي'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {item.barcode && (
                          <button
                            onClick={() => { setPrintBarcodeItem(item); setBarcodeCopies(1); }}
                            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                            title="طباعة ملصق باركود"
                          >
                            <Printer size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                          title="تعديل"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => openWasteModal(item)}
                          className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg"
                          title="تسجيل هوالك"
                        >
                          <AlertCircle size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
                            const result = onDeleteItem(item.id);
                            if (result && result.ok === false) {
                              alert(result.error || 'تعذّر حذف المنتج');
                            }
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                          title="حذف"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredInventory.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            لا توجد منتجات مطابقة للبحث
          </div>
        )}

        <PaginationBar
          total={productPagination.total}
          page={productPagination.page}
          pageSize={productPagination.pageSize}
          totalPages={productPagination.totalPages}
          from={productPagination.from}
          to={productPagination.to}
          canPrev={productPagination.canPrev}
          canNext={productPagination.canNext}
          onPageChange={productPagination.setPage}
          onPageSizeChange={productPagination.setPageSize}
          itemLabel="منتج"
        />
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setShowEditModal(false); setSelectedItem(null); }}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                {showAddModal ? 'إضافة منتج جديد' : 'تعديل المنتج'}
              </h3>
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setSelectedItem(null); resetForm(); }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  اسم المنتج *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    الكود
                    <span className="text-xs text-gray-400 font-normal"> — لو فاضي بيتولّد تلقائيًا</span>
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    className={`w-full p-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white ${
                      isDuplicateCode ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  />
                  {isDuplicateCode && (
                    <p className="text-red-500 text-xs mt-1 font-bold">⚠️ هذا الكود مستخدم بالفعل لمنتج آخر</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      الباركود
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateBarcode}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Wand2 size={13} />
                      توليد تلقائي
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={e => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                    placeholder="امسح أو اكتب الباركود..."
                    className={`w-full p-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white font-mono ${
                      isDuplicateBarcode ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  />
                  {isDuplicateBarcode && (
                    <p className="text-red-500 text-xs mt-1 font-bold">⚠️ هذا الباركود مستخدم بالفعل لمنتج آخر</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الفئة *
                </label>
                <select
                  value={formData.categoryId}
                  onChange={e => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="">اختر الفئة</option>
                  {categoryTypes.map(type => (
                    <optgroup key={type.type} label={type.label}>
                      {categories.filter(c => c.type === type.type).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    سعر الشراء
                  </label>
                  <input
                    type="number"
                    value={formData.costPrice}
                    onChange={e => setFormData(prev => ({ ...prev, costPrice: Number(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    سعر البيع
                  </label>
                  <input
                    type="number"
                    value={formData.sellPrice}
                    onChange={e => setFormData(prev => ({ ...prev, sellPrice: Number(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
              </div>

              {showAddModal && (
                <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <input
                    type="checkbox"
                    id="hasIMEI"
                    checked={formData.hasIMEI}
                    onChange={e => setFormData(prev => ({ ...prev, hasIMEI: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <label htmlFor="hasIMEI" className="text-sm text-gray-700 dark:text-gray-300">
                    هذا المنتج جهاز (يحتاج IMEI)
                  </label>
                </div>
              )}

              {!formData.hasIMEI && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      الكمية
                    </label>
                    <input
                      type="number"
                      value={formData.quantity}
                      onChange={e => setFormData(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      الحد الأدنى
                    </label>
                    <input
                      type="number"
                      value={formData.minQuantity}
                      onChange={e => setFormData(prev => ({ ...prev, minQuantity: Number(e.target.value) }))}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); setSelectedItem(null); resetForm(); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={showAddModal ? handleAdd : handleEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {showAddModal ? 'إضافة' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="modal-overlay" onClick={() => setShowCategoryModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">إضافة فئة جديدة</h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  اسم الفئة *
                </label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  نوع الفئة
                </label>
                <select
                  value={newCategory.type}
                  onChange={e => setNewCategory(prev => ({ ...prev, type: e.target.value as 'device' | 'accessory' | 'spare_part' }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="device">أجهزة</option>
                  <option value="accessory">إكسسوارات</option>
                  <option value="spare_part">قطع غيار</option>
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddCategory}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                إضافة
              </button>
            </div>
          </div>
        </div>
      )}

      {showWasteModal && wasteItem && (
        <div className="modal-overlay" onClick={() => setShowWasteModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white">تسجيل هوالك</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{wasteItem.name}</p>
              </div>
              <button
                onClick={() => setShowWasteModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الكمية</label>
                  <input
                    type="number"
                    min={1}
                    max={getActualQuantity(wasteItem)}
                    value={wasteForm.quantity}
                    onChange={e => setWasteForm(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">المورد</label>
                  <select
                    value={wasteForm.supplierId}
                    onChange={e => setWasteForm(prev => ({ ...prev, supplierId: e.target.value }))}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  >
                    <option value="">بدون مورد</option>
                    {suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">السبب</label>
                <input
                  type="text"
                  value={wasteForm.reason}
                  onChange={e => setWasteForm(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ملاحظات</label>
                <textarea
                  value={wasteForm.notes}
                  onChange={e => setWasteForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  placeholder="تفاصيل إضافية"
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowWasteModal(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleRecordWaste}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                حفظ الهوالك
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Print Barcode Label Modal */}
      {printBarcodeItem && (
        <div className="modal-overlay" onClick={() => setPrintBarcodeItem(null)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-gray-200 dark:border-gray-700 animate-fadeIn"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarcodeIcon size={22} />
                <h3 className="font-bold text-base">طباعة ملصق الباركود</h3>
              </div>
              <button
                onClick={() => setPrintBarcodeItem(null)}
                className="p-1 hover:bg-white/20 rounded-lg transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-gray-50 dark:bg-gray-700/60 p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-center">
                <p className="font-bold text-gray-900 dark:text-white text-sm">{printBarcodeItem.name}</p>
                <p className="text-base font-black text-blue-600 dark:text-blue-400 mt-1">
                  {formatCurrency(printBarcodeItem.sellPrice)}
                </p>
                <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mt-2 tracking-widest bg-white dark:bg-gray-800 py-1 px-2 rounded inline-block border">
                  {printBarcodeItem.barcode}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  عدد الملصقات المطلوب طباعتها:
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 5, 10, 20].map(cnt => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setBarcodeCopies(cnt)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${
                        barcodeCopies === cnt
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={barcodeCopies}
                  onChange={e => setBarcodeCopies(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full mt-2 p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-center font-bold text-sm"
                />
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setPrintBarcodeItem(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  printBarcodeSticker(
                    printBarcodeItem.name,
                    printBarcodeItem.sellPrice,
                    printBarcodeItem.barcode,
                    localStorage.getItem('shopName') || 'MOBPOS',
                    barcodeCopies
                  );
                  setPrintBarcodeItem(null);
                }}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow"
              >
                <Printer size={16} />
                <span>طباعة الآن</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
