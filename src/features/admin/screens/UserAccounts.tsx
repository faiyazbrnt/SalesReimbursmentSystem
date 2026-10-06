import { useState, useEffect, useMemo } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select, Label } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { Modal } from '../../../components/shared/Modal';
import { useAppContext } from '../../../components/AppContext';
import { useToast } from '../../../components/shared/ToastContext';
import { createUser, updateUser, deleteUser, ApiError } from '../../../lib/api';
import { User, UserRole } from '../../../types';

export function UserAccounts() {
  const { users, currentUser, refresh } = useAppContext();
  const { addToast } = useToast();

  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Partial<User>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Add User State
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    role: UserRole.REQUESTOR,
    department: 'Sales',
    jobTitle: '',
    reportsTo: '',
    employmentStatus: 'Active' as 'Active' | 'Inactive',
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  // Delete User State
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'name' | 'department' | 'role'>('name');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      const matchesSearch = !q || [u.name, u.email, u.department, u.jobTitle].some(v => (v || '').toLowerCase().includes(q));
      const matchesRole = !roleFilter || u.role === roleFilter;
      const matchesDepartment = !departmentFilter || u.department === departmentFilter;
      const matchesStatus = !statusFilter || u.employmentStatus === statusFilter;
      return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
    }).sort((a, b) => {
      if (sortOrder === 'department') return (a.department || '').localeCompare(b.department || '') || a.name.localeCompare(b.name);
      if (sortOrder === 'role') return a.role.localeCompare(b.role) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [users, search, roleFilter, departmentFilter, statusFilter, sortOrder]);
  const departments = useMemo(() => Array.from(new Set(users.map(user => user.department).filter(Boolean))).sort(), [users]);
  const hasFilters = Boolean(roleFilter || departmentFilter || statusFilter);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, departmentFilter, statusFilter, sortOrder]);

  const openEditor = (user: User) => {
    setEditing(user);
    setForm({
      role: user.role,
      department: user.department,
      jobTitle: user.jobTitle,
      reportsTo: user.reportsTo,
      employmentStatus: user.employmentStatus,
    });
    setError('');
  };

  // Anyone who can sit above someone in the chain. Self is excluded server-side
  // too, but filtering here keeps it out of the picker.
  const managerChoices = users.filter(u => u.id !== editing?.id);

  const save = async (confirmOrphan = false) => {
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      await updateUser(editing.id, {
        role: form.role,
        department: form.department,
        job_title: form.jobTitle,
        reports_to: form.reportsTo || null,
        employment_status: form.employmentStatus,
        confirmOrphan,
      });
      await refresh();
      addToast('Record saved successfully.', 'success');
      setEditing(null);
    } catch (err) {
      const e = err as ApiError;
      // The server returns 409 with error:'orphan_warning' when demoting an
      // approver who still has direct reports — surface it as a confirm.
      if (e.status === 409 && e.body?.error === 'orphan_warning') {
        if (window.confirm(`${e.body.message}\n\nProceed anyway?`)) {
          await save(true);
          return;
        }
        setError('Change cancelled — reassign their reports first.');
      } else {
        setError(e.message || 'Could not update the user.');
      }
    } finally {
      setSaving(false);
    }
  };

  const openAddUser = () => {
    setAddForm({
      name: '',
      email: '',
      role: UserRole.REQUESTOR,
      department: departments[0] || 'Sales',
      jobTitle: '',
      reportsTo: '',
      employmentStatus: 'Active',
    });
    setAddError('');
    setIsAdding(true);
  };

  const handleCreateUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!addForm.name.trim()) {
      setAddError('Please enter the user full name.');
      return;
    }
    if (!addForm.email.trim()) {
      setAddError('Please enter an email address.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(addForm.email.trim())) {
      setAddError('Please enter a valid email address.');
      return;
    }
    if (!addForm.department.trim()) {
      setAddError('Please specify a department.');
      return;
    }

    setAddSaving(true);
    setAddError('');
    try {
      await createUser({
        name: addForm.name.trim(),
        email: addForm.email.trim(),
        role: addForm.role,
        department: addForm.department.trim(),
        job_title: addForm.jobTitle.trim() || undefined,
        reports_to: addForm.reportsTo || null,
        employment_status: addForm.employmentStatus,
      });
      await refresh();
      addToast(`User account created for ${addForm.name.trim()}.`, 'success');
      setIsAdding(false);
    } catch (err) {
      const e = err as ApiError;
      setAddError(e.message || 'Could not create user account.');
    } finally {
      setAddSaving(false);
    }
  };

  const openDeleteModal = (user: User) => {
    setDeletingUser(user);
    setDeleteError('');
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleteSaving(true);
    setDeleteError('');
    try {
      await deleteUser(deletingUser.id);
      await refresh();
      addToast('Record deleted successfully.', 'success');
      setDeletingUser(null);
    } catch (err) {
      const e = err as ApiError;
      setDeleteError(e.message || 'Could not delete user account.');
    } finally {
      setDeleteSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="font-label-sm text-primary font-bold tracking-wider uppercase">System Administration</span>
          <h1 className="font-display text-display text-on-surface mt-1">User Accounts</h1>
          <p className="text-body-md text-outline mt-1">Manage user accounts, roles, departments, and reporting relationships.</p>
        </div>
        <Button onClick={openAddUser} className="gap-2 shrink-0">
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Add User
        </Button>
      </div>

      <div className="space-y-0">
      <Card className="rounded-b-none p-4 shadow-none bg-white">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="min-w-[240px] flex-1 max-w-xl"><Input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, department, or title..." /></div>
          <Select containerClassName="w-full sm:w-40 sm:flex-none" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter users by role"><option value="">All roles</option>{Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}</Select>
          <Button variant="outline" className="gap-2 sm:flex-none" onClick={() => setShowFilters(open => !open)}><span className="material-symbols-outlined text-[18px]">filter_list</span>Filters{departmentFilter || statusFilter ? ' (active)' : ''}</Button>
          <Select containerClassName="w-full sm:w-40 sm:flex-none" value={sortOrder} onChange={e => setSortOrder(e.target.value as typeof sortOrder)} aria-label="Sort user accounts"><option value="name">Name A–Z</option><option value="department">Department</option><option value="role">Role</option></Select>
          {(search || hasFilters || sortOrder !== 'name') && <button className="text-xs font-semibold text-primary hover:underline" onClick={() => { setSearch(''); setRoleFilter(''); setDepartmentFilter(''); setStatusFilter(''); setSortOrder('name'); }}>Clear all</button>}
          <span className="sm:ml-auto text-xs text-outline whitespace-nowrap">{filteredUsers.length} of {users.length}</span>
        </div>
        {showFilters && <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-outline-variant pt-4">
          <div><Label>Department</Label><Select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}><option value="">All departments</option>{departments.map(item => <option key={item}>{item}</option>)}</Select></div>
          <div><Label>Employment Status</Label><Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option></Select></div>
        </div>}
        {hasFilters && <div className="mt-3 flex flex-wrap gap-2">
          {roleFilter && <button onClick={() => setRoleFilter('')} className="inline-flex items-center gap-1 rounded-full bg-primary/8 text-primary px-3 py-1 text-xs font-semibold">{roleFilter}<span className="material-symbols-outlined text-[14px]">close</span></button>}
          {departmentFilter && <button onClick={() => setDepartmentFilter('')} className="inline-flex items-center gap-1 rounded-full bg-primary/8 text-primary px-3 py-1 text-xs font-semibold">{departmentFilter}<span className="material-symbols-outlined text-[14px]">close</span></button>}
          {statusFilter && <button onClick={() => setStatusFilter('')} className="inline-flex items-center gap-1 rounded-full bg-primary/8 text-primary px-3 py-1 text-xs font-semibold">{statusFilter}<span className="material-symbols-outlined text-[14px]">close</span></button>}
        </div>}
      </Card>

      <Card className="!mt-[-1px] rounded-t-none bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Reports To</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-outline-variant">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-outline">
                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">person_search</span>
                    <p className="font-label-md">No users match your search.</p>
                  </td>
                </tr>
              ) : paginatedUsers.map(user => {
                const manager = users.find(u => u.id === user.reportsTo);
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-xs font-semibold">{user.name.split(' ').map(n=>n[0]).join('')}</div>
                        )}
                        <p className="text-sm font-bold">{user.name}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-on-surface-variant text-sm">{user.email}</td>
                    <td className="px-6 py-5 text-on-surface-variant text-sm">{user.department}</td>
                    <td className="px-6 py-5 text-sm font-bold text-primary">{user.role}</td>
                    <td className="px-6 py-5 text-on-surface-variant text-sm">{manager ? manager.name : '—'}</td>
                    <td className="px-6 py-5 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.employmentStatus === 'Active' ? 'bg-green-100 text-green-800' : 'bg-surface-container-high text-on-surface-variant'}`}>
                        {user.employmentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditor(user)}>Edit</Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-error hover:bg-error/10 hover:border-error border-outline-variant"
                          onClick={() => openDeleteModal(user)}
                          disabled={user.id === currentUser.id}
                          title={user.id === currentUser.id ? 'You cannot delete your own account' : `Delete ${user.name}`}
                          aria-label={`Delete user ${user.name}`}
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </Card>
      </div>

      {/* Add User Modal */}
      {isAdding && (
        <Modal isOpen onClose={() => !addSaving && setIsAdding(false)} titleId="add-user-title" className="max-w-lg">
          <div className="bg-surface-container-lowest rounded-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[24px]">person_add</span>
                <h3 id="add-user-title" className="font-headline-sm text-on-surface">Add New User</h3>
              </div>
              <button
                aria-label="Close add user modal"
                onClick={() => !addSaving && setIsAdding(false)}
                className="text-outline hover:text-on-surface"
              >
                <span aria-hidden="true" className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Full Name <span className="text-error">*</span></Label>
                  <Input
                    required
                    placeholder="e.g. Maria Clara"
                    value={addForm.name}
                    onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Email Address <span className="text-error">*</span></Label>
                  <Input
                    type="email"
                    required
                    placeholder="e.g. maria.clara@mgenesis.com"
                    value={addForm.email}
                    onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select
                    value={addForm.role}
                    onChange={e => setAddForm(p => ({ ...p, role: e.target.value as UserRole }))}
                  >
                    {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Employment Status</Label>
                  <Select
                    value={addForm.employmentStatus}
                    onChange={e => setAddForm(p => ({ ...p, employmentStatus: e.target.value as 'Active' | 'Inactive' }))}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </Select>
                </div>
                <div>
                  <Label>Department <span className="text-error">*</span></Label>
                  <Input
                    required
                    placeholder="e.g. Sales, Marketing, IT..."
                    value={addForm.department}
                    onChange={e => setAddForm(p => ({ ...p, department: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Job Title</Label>
                  <Input
                    placeholder="e.g. Account Executive"
                    value={addForm.jobTitle}
                    onChange={e => setAddForm(p => ({ ...p, jobTitle: e.target.value }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Reports To</Label>
                  <Select
                    value={addForm.reportsTo}
                    onChange={e => setAddForm(p => ({ ...p, reportsTo: e.target.value }))}
                  >
                    <option value="">— No manager —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </Select>
                </div>
              </div>

              {addError && (
                <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                  {addError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
                <Button type="button" variant="ghost" onClick={() => setIsAdding(false)} disabled={addSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addSaving} className="gap-2">
                  {addSaving ? <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> : null}
                  Create User
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Delete User Confirmation Modal */}
      {deletingUser && (
        <Modal isOpen onClose={() => !deleteSaving && setDeletingUser(null)} titleId="delete-user-title" className="max-w-md">
          <div className="bg-surface-container-lowest rounded-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant pb-3">
              <div className="flex items-center gap-2 text-error">
                <span className="material-symbols-outlined text-[24px]">warning</span>
                <h3 id="delete-user-title" className="font-headline-sm text-on-surface">Delete User</h3>
              </div>
              <button
                aria-label="Close delete user modal"
                onClick={() => !deleteSaving && setDeletingUser(null)}
                className="text-outline hover:text-on-surface"
              >
                <span aria-hidden="true" className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-sm text-on-surface-variant">
              Are you sure you want to permanently delete <strong className="text-on-surface">{deletingUser.name}</strong> (<span className="text-on-surface-variant font-mono text-xs">{deletingUser.email}</span>)?
            </p>
            <p className="text-xs text-outline">
              This action cannot be undone. Users with existing claims, advances, or direct reports must be reassigned or marked Inactive instead.
            </p>

            {deleteError && (
              <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
              <Button type="button" variant="ghost" onClick={() => setDeletingUser(null)} disabled={deleteSaving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleDeleteUser}
                disabled={deleteSaving}
                className="gap-2 bg-error hover:bg-error/90 text-on-error"
              >
                {deleteSaving ? <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> : null}
                Delete User
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} titleId="user-editor-title" className="max-w-lg">
            <div className="bg-surface-container-lowest rounded-xl w-full p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-outline-variant pb-3">
                <h3 id="user-editor-title" className="font-headline-sm text-on-surface">Edit {editing.name}</h3>
                <button aria-label="Close user editor" onClick={() => setEditing(null)} className="text-outline hover:text-on-surface">
                  <span aria-hidden="true" className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Role</Label>
                  <Select
                    value={form.role || ''}
                    onChange={e => setForm(p => ({ ...p, role: e.target.value as UserRole }))}
                    disabled={editing.id === currentUser.id}
                  >
                    {Object.values(UserRole).map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                  {editing.id === currentUser.id && <p className="text-xs text-outline mt-1">You can't change your own role.</p>}
                </div>
                <div>
                  <Label>Employment Status</Label>
                  <Select value={form.employmentStatus || 'Active'} onChange={e => setForm(p => ({ ...p, employmentStatus: e.target.value as 'Active' | 'Inactive' }))}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </Select>
                </div>
                <div>
                  <Label>Department</Label>
                  <Input value={form.department || ''} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} />
                </div>
                <div>
                  <Label>Job Title</Label>
                  <Input value={form.jobTitle || ''} onChange={e => setForm(p => ({ ...p, jobTitle: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Reports To</Label>
                  <Select value={form.reportsTo || ''} onChange={e => setForm(p => ({ ...p, reportsTo: e.target.value || undefined }))}>
                    <option value="">— No manager —</option>
                    {managerChoices.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                  </Select>
                </div>
              </div>

              {error && <p className="text-error text-sm">{error}</p>}

              <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
                <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
                <Button onClick={() => save()} disabled={saving} className="gap-2">
                  {saving ? <span className="material-symbols-outlined animate-spin text-[18px]">sync</span> : null}
                  Save Changes
                </Button>
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
}
