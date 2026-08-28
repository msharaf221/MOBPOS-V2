import { useState } from 'react';
import { Search, Plus, Edit2, Trash2, X, Shield, Eye, EyeOff } from 'lucide-react';
import { User } from '../types';
import { hashPasswordForStorage } from '../utils/passwords';

interface UsersProps {
  users: User[];
  currentUser: User;
  onUpdate: (users: User[]) => void;
}

const roleLabels: Record<string, string> = {
  admin: 'مدير النظام',
  manager: 'مشرف',
  staff: 'موظف'
};

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  staff: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
};

const permissions = {
  admin: [
    'لوحة التحكم',
    'نقطة البيع',
    'المخزون',
    'إدارة IMEI',
    'الصيانة',
    'العملاء',
    'المبيعات',
    'الخزائن',
    'الموردين',
    'الموظفين',
    'الإعدادات'
  ],
  manager: [
    'لوحة التحكم',
    'نقطة البيع',
    'المخزون',
    'إدارة IMEI',
    'الصيانة',
    'العملاء',
    'المبيعات',
    'الخزائن',
    'المالية',
    'الموردين'
  ],
  staff: [
    'لوحة التحكم',
    'نقطة البيع',
    'الصيانة',
    'العملاء'
  ]
};

export default function Users({ users, currentUser, onUpdate }: UsersProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: 'staff' as 'admin' | 'manager' | 'staff'
  });

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = async () => {
    if (!formData.username || !formData.name || (!editingUser && !formData.password)) {
      alert('جميع الحقول مطلوبة');
      return;
    }

    // Check if username exists (for new users or changed username)
    if (!editingUser || editingUser.username !== formData.username) {
      if (users.some(u => u.username === formData.username)) {
        alert('اسم المستخدم موجود بالفعل');
        return;
      }
    }

    // كلمات السر تُحفظ مجزأة (PBKDF2-HMAC-SHA-256 بملح فريد) — لا نص عادي في قاعدة البيانات
    const hashed = formData.password ? await hashPasswordForStorage(formData.password) : '';

    if (editingUser) {
      // Update existing user
      const updatedUsers = users.map(u => {
        if (u.id === editingUser.id) {
          return {
            ...u,
            username: formData.username,
            name: formData.name,
            role: formData.role,
            ...(hashed && { password: hashed })
          };
        }
        return u;
      });
      onUpdate(updatedUsers);
    } else {
      // Add new user
      const newUser: User = {
        id: `user-${Date.now()}`,
        username: formData.username,
        password: hashed,
        name: formData.name,
        role: formData.role,
        createdAt: new Date().toISOString()
      };
      onUpdate([...users, newUser]);
    }

    closeModal();
  };

  const handleDelete = (id: string) => {
    if (id === currentUser.id) {
      alert('لا يمكنك حذف حسابك الحالي');
      return;
    }
    
    const user = users.find(u => u.id === id);
    if (user?.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
      alert('لا يمكن حذف آخر مدير في النظام');
      return;
    }

    if (confirm(`هل أنت متأكد من حذف المستخدم "${user?.name}"؟`)) {
      onUpdate(users.filter(u => u.id !== id));
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      name: user.name,
      role: user.role
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      password: '',
      name: '',
      role: 'staff'
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData({ username: '', password: '', name: '', role: 'staff' });
    setShowPassword(false);
  };

  const openPermissionsModal = (user: User) => {
    setSelectedUser(user);
    setShowPermissionsModal(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">الموظفين</h1>
          <p className="text-gray-500 dark:text-gray-400">إدارة المستخدمين والصلاحيات</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus size={20} />
          إضافة موظف
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم أو اسم المستخدم..."
            className="w-full py-2 pr-10 pl-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-800 dark:text-white border-0"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 text-sm">إجمالي المستخدمين</p>
          <p className="text-2xl font-bold text-gray-800 dark:text-white">{users.length}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400 text-sm">مدراء</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">
            {users.filter(u => u.role === 'admin').length}
          </p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
          <p className="text-blue-600 dark:text-blue-400 text-sm">مشرفين</p>
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
            {users.filter(u => u.role === 'manager').length}
          </p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600">
          <p className="text-gray-600 dark:text-gray-400 text-sm">موظفين</p>
          <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
            {users.filter(u => u.role === 'staff').length}
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الموظف</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">اسم المستخدم</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">الصلاحية</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-300">تاريخ الإنشاء</th>
                <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 dark:text-gray-300">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUsers.map(user => (
                <tr key={user.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${user.id === currentUser.id ? 'bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white">
                          {user.name}
                          {user.id === currentUser.id && (
                            <span className="mr-2 text-xs text-blue-600 dark:text-blue-400">(أنت)</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-gray-600 dark:text-gray-400">
                    @{user.username}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${roleColors[user.role]}`}>
                      {roleLabels[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => openPermissionsModal(user)}
                        className="p-2 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg"
                        title="عرض الصلاحيات"
                      >
                        <Shield size={18} />
                      </button>
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        title="تعديل"
                      >
                        <Edit2 size={18} />
                      </button>
                      {user.id !== currentUser.id && (
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                          title="حذف"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            لا يوجد مستخدمين
          </div>
        )}
      </div>

      {/* Permissions Legend */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <Shield size={20} />
          ملخص الصلاحيات
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(['admin', 'manager', 'staff'] as const).map(role => (
            <div key={role} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${roleColors[role]}`}>
                  {roleLabels[role]}
                </span>
              </div>
              <ul className="space-y-1">
                {permissions[role].map(perm => (
                  <li key={perm} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                    {perm}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white">
                {editingUser ? 'تعديل الموظف' : 'إضافة موظف جديد'}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الاسم الكامل *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="مثال: أحمد محمد"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  اسم المستخدم *
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={e => setFormData(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                    placeholder="username"
                    className="w-full p-3 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  كلمة المرور {editingUser ? '(اتركها فارغة لعدم التغيير)' : '*'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={editingUser ? '••••••••' : 'أدخل كلمة المرور'}
                    className="w-full p-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  الصلاحية *
                </label>
                <select
                  value={formData.role}
                  onChange={e => setFormData(prev => ({ ...prev, role: e.target.value as 'admin' | 'manager' | 'staff' }))}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="staff">موظف</option>
                  <option value="manager">مشرف</option>
                  <option value="admin">مدير النظام</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formData.role === 'admin' && 'صلاحيات كاملة على النظام'}
                  {formData.role === 'manager' && 'صلاحيات إدارية بدون إدارة الموظفين'}
                  {formData.role === 'staff' && 'صلاحيات محدودة (البيع والصيانة فقط)'}
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingUser ? 'حفظ التغييرات' : 'إضافة الموظف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowPermissionsModal(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xl font-bold">
                  {selectedUser.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white">{selectedUser.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[selectedUser.role]}`}>
                    {roleLabels[selectedUser.role]}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6">
              <h4 className="font-medium text-gray-800 dark:text-white mb-3">الصفحات المتاحة:</h4>
              <div className="space-y-2">
                {permissions[selectedUser.role].map(perm => (
                  <div key={perm} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="text-gray-800 dark:text-white">{perm}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowPermissionsModal(false)}
                className="w-full py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
