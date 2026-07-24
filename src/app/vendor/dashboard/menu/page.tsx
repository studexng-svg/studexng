"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { TEAL, toArray } from "@/lib/tokens";
import { HEADING_FONT, LoadingSpinner, EmptyState } from "../_shared";
import { Plus, Pencil, Trash2, X, ChefHat, Layers, Tag } from "lucide-react";

interface MenuCategory { id: number; name: string; display_order: number; is_active: boolean; }
interface Addon { id: number; group: number; name: string; price_delta: string; is_available: boolean; display_order: number; }
interface AddonGroup { id: number; menu_item: number; name: string; is_required: boolean; min_selections: number; max_selections: number; display_order: number; addons: Addon[]; }
interface MenuItem {
  id: number; listing: number; listing_title: string; listing_price: string; listing_is_available: boolean;
  menu_category: number | null; prep_time_minutes: number | null; allergens: string[]; ingredients: string;
  is_seasonal: boolean; is_hidden: boolean; is_archived: boolean;
  availability_window_start: string | null; availability_window_end: string | null;
  addon_groups: AddonGroup[];
}
interface Listing { id: number; title: string; price: string; is_available: boolean; }

const emptyCategoryForm = { name: "", display_order: 0, is_active: true };
const emptyMenuItemForm = {
  listing: 0, menu_category: "" as number | "", prep_time_minutes: "", allergens: "", ingredients: "",
  is_seasonal: false, availability_window_start: "", availability_window_end: "",
};
const emptyGroupForm = { name: "", is_required: false, min_selections: 0, max_selections: 1, display_order: 0 };
const emptyAddonForm = { name: "", price_delta: "0", is_available: true, display_order: 0 };

export default function VendorMenuPage() {
  const [loading, setLoading] = useState(true);
  const [notEnabled, setNotEnabled] = useState(false);
  const [error, setError] = useState("");

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);

  const [catModal, setCatModal] = useState<{ editing: MenuCategory | null } | null>(null);
  const [catForm, setCatForm] = useState(emptyCategoryForm);

  const [itemModal, setItemModal] = useState<{ listingId: number; editing: MenuItem | null } | null>(null);
  const [itemForm, setItemForm] = useState(emptyMenuItemForm);

  const [groupModal, setGroupModal] = useState<{ menuItemId: number; editing: AddonGroup | null } | null>(null);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);

  const [addonModal, setAddonModal] = useState<{ groupId: number; editing: Addon | null } | null>(null);
  const [addonForm, setAddonForm] = useState(emptyAddonForm);

  const [expanded, setExpanded] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    try {
      const [catRes, itemRes, listRes] = await Promise.all([
        api.services.menuCategories(),
        api.services.menuItems(),
        api.services.listingsAuth({ page_size: "500" }),
      ]);
      if (catRes.status === 403 || itemRes.status === 403) { setNotEnabled(true); return; }
      setCategories(toArray(await catRes.json()));
      setMenuItems(toArray(await itemRes.json()));
      const allListings: Listing[] = toArray(await listRes.json());
      setListings(allListings);
    } catch {
      setError("Could not load your menu. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // ── Categories ──────────────────────────────────────────────────────────
  const openCategoryCreate = () => { setCatForm(emptyCategoryForm); setCatModal({ editing: null }); };
  const openCategoryEdit = (c: MenuCategory) => { setCatForm({ name: c.name, display_order: c.display_order, is_active: c.is_active }); setCatModal({ editing: c }); };

  const saveCategory = async () => {
    if (!catForm.name.trim()) { setError("Category name is required."); return; }
    setSaving(true); setError("");
    try {
      const res = catModal?.editing
        ? await api.services.updateMenuCategory(catModal.editing.id, catForm)
        : await api.services.createMenuCategory(catForm);
      if (!res.ok) { const d = await res.json(); setError(Object.values(d)[0]?.toString() || "Could not save category."); return; }
      setCatModal(null);
      await loadAll();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  };

  const deleteCategory = async (id: number) => {
    if (!confirm("Delete this category? Items in it will become uncategorized.")) return;
    await api.services.deleteMenuCategory(id);
    await loadAll();
  };

  // ── Menu items ──────────────────────────────────────────────────────────
  const openItemCreate = (listingId: number) => {
    setItemForm(emptyMenuItemForm);
    setItemModal({ listingId, editing: null });
  };
  const openItemEdit = (item: MenuItem) => {
    setItemForm({
      listing: item.listing,
      menu_category: item.menu_category ?? "",
      prep_time_minutes: item.prep_time_minutes?.toString() ?? "",
      allergens: (item.allergens || []).join(", "),
      ingredients: item.ingredients || "",
      is_seasonal: item.is_seasonal,
      availability_window_start: item.availability_window_start || "",
      availability_window_end: item.availability_window_end || "",
    });
    setItemModal({ listingId: item.listing, editing: item });
  };

  const saveMenuItem = async () => {
    setSaving(true); setError("");
    const body: Record<string, unknown> = {
      menu_category: itemForm.menu_category || null,
      prep_time_minutes: itemForm.prep_time_minutes ? Number(itemForm.prep_time_minutes) : null,
      allergens: itemForm.allergens.split(",").map(a => a.trim()).filter(Boolean),
      ingredients: itemForm.ingredients,
      is_seasonal: itemForm.is_seasonal,
      availability_window_start: itemForm.availability_window_start || null,
      availability_window_end: itemForm.availability_window_end || null,
    };
    try {
      const res = itemModal?.editing
        ? await api.services.updateMenuItem(itemModal.editing.id, body)
        : await api.services.createMenuItem({ ...body, listing: itemModal!.listingId });
      if (!res.ok) { const d = await res.json(); setError(Object.values(d)[0]?.toString() || "Could not save menu item."); return; }
      setItemModal(null);
      await loadAll();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  };

  const toggleHidden = async (item: MenuItem) => {
    await api.services.updateMenuItem(item.id, { is_hidden: !item.is_hidden });
    await loadAll();
  };

  const toggleArchived = async (item: MenuItem) => {
    if (!item.is_archived && !confirm("Archive this menu item? It will be removed from the active menu but kept for order history.")) return;
    await api.services.updateMenuItem(item.id, { is_archived: !item.is_archived });
    await loadAll();
  };

  // ── Add-on groups ───────────────────────────────────────────────────────
  const openGroupCreate = (menuItemId: number) => { setGroupForm(emptyGroupForm); setGroupModal({ menuItemId, editing: null }); };
  const openGroupEdit = (menuItemId: number, g: AddonGroup) => {
    setGroupForm({ name: g.name, is_required: g.is_required, min_selections: g.min_selections, max_selections: g.max_selections, display_order: g.display_order });
    setGroupModal({ menuItemId, editing: g });
  };

  const saveGroup = async () => {
    setSaving(true); setError("");
    try {
      const res = groupModal?.editing
        ? await api.services.updateAddonGroup(groupModal.editing.id, groupForm)
        : await api.services.createAddonGroup({ ...groupForm, menu_item: groupModal!.menuItemId });
      if (!res.ok) { const d = await res.json(); setError(Object.values(d)[0]?.toString() || "Could not save add-on group."); return; }
      setGroupModal(null);
      await loadAll();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  };

  const deleteGroup = async (id: number) => {
    if (!confirm("Delete this add-on group and all its options?")) return;
    await api.services.deleteAddonGroup(id);
    await loadAll();
  };

  // ── Addons ──────────────────────────────────────────────────────────────
  const openAddonCreate = (groupId: number) => { setAddonForm(emptyAddonForm); setAddonModal({ groupId, editing: null }); };
  const openAddonEdit = (groupId: number, a: Addon) => {
    setAddonForm({ name: a.name, price_delta: a.price_delta, is_available: a.is_available, display_order: a.display_order });
    setAddonModal({ groupId, editing: a });
  };

  const saveAddon = async () => {
    setSaving(true); setError("");
    try {
      const body = { ...addonForm, price_delta: addonForm.price_delta };
      const res = addonModal?.editing
        ? await api.services.updateAddon(addonModal.editing.id, body)
        : await api.services.createAddon({ ...body, group: addonModal!.groupId });
      if (!res.ok) { const d = await res.json(); setError(Object.values(d)[0]?.toString() || "Could not save add-on."); return; }
      setAddonModal(null);
      await loadAll();
    } catch { setError("Network error."); }
    finally { setSaving(false); }
  };

  const deleteAddon = async (id: number) => {
    if (!confirm("Delete this add-on option?")) return;
    await api.services.deleteAddon(id);
    await loadAll();
  };

  if (loading) return <LoadingSpinner />;

  if (notEnabled) {
    return (
      <div className="bg-white border border-stone-200 rounded-2xl p-10 text-center">
        <ChefHat className="w-10 h-10 text-stone-200 mx-auto mb-3" />
        <p className="font-bold text-stone-900">Menu management isn't enabled for your account</p>
        <p className="text-stone-400 text-sm mt-1">This feature is only available to vendor types that support menu-based ordering.</p>
      </div>
    );
  }

  const listingsWithoutMenu = listings.filter(l => !menuItems.some(m => m.listing === l.id));
  const sortedCategories = [...categories].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="pb-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-teal-600 text-xs tracking-[0.25em] uppercase font-bold mb-0.5">Catalog</p>
          <h2 className="font-black text-stone-900 text-xl tracking-tight" style={HEADING_FONT}>Menu Management</h2>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

      {/* ── Categories ── */}
      <section className="bg-white border border-stone-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-stone-900 text-sm flex items-center gap-2"><Tag className="w-4 h-4 text-teal-600" /> Categories</p>
          <button onClick={openCategoryCreate} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white text-xs font-semibold" style={{ background: TEAL }}>
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
        {sortedCategories.length === 0 ? (
          <p className="text-stone-400 text-sm py-4 text-center">No categories yet — items will show as uncategorized.</p>
        ) : (
          <div className="space-y-1.5">
            {sortedCategories.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-50">
                <span className="flex-1 text-sm font-medium text-stone-800">{c.name}</span>
                {!c.is_active && <span className="text-[10px] font-bold text-stone-400 bg-stone-200 px-2 py-0.5 rounded-full">Inactive</span>}
                <span className="text-[10px] text-stone-400">order {c.display_order}</span>
                <button onClick={() => openCategoryEdit(c)} className="p-1.5 text-stone-400 hover:text-stone-700"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteCategory(c.id)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Listings not yet on the menu ── */}
      {listingsWithoutMenu.length > 0 && (
        <section className="bg-white border border-stone-200 rounded-2xl p-4">
          <p className="font-bold text-stone-900 text-sm mb-3">Add a listing to your menu</p>
          <p className="text-stone-400 text-xs mb-3">
            Create the listing itself under <span className="font-semibold">Listings</span> first — then attach menu details (category, allergens, add-ons) here.
          </p>
          <div className="space-y-1.5">
            {listingsWithoutMenu.map(l => (
              <div key={l.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-50">
                <span className="flex-1 text-sm font-medium text-stone-800 truncate">{l.title}</span>
                <span className="text-xs text-stone-400">₦{Number(l.price).toLocaleString()}</span>
                <button onClick={() => openItemCreate(l.id)} className="px-3 py-1 rounded-full text-white text-xs font-semibold" style={{ background: TEAL }}>
                  Add to Menu
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Menu items ── */}
      <section className="space-y-3">
        <p className="font-bold text-stone-900 text-sm flex items-center gap-2 px-1"><Layers className="w-4 h-4 text-teal-600" /> Menu Items</p>
        {menuItems.length === 0 ? (
          <EmptyState icon={ChefHat} message="No menu items yet" />
        ) : (
          menuItems.map(item => {
            const isOpen = expanded === item.id;
            return (
              <div key={item.id} className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(isOpen ? null : item.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm truncate">{item.listing_title}</p>
                    <p className="text-xs text-stone-400">
                      ₦{Number(item.listing_price).toLocaleString()}
                      {item.is_hidden && <span className="ml-2 text-amber-600 font-semibold">Hidden</span>}
                      {item.is_archived && <span className="ml-2 text-stone-500 font-semibold">Archived</span>}
                    </p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); openItemEdit(item); }} className="p-1.5 text-stone-400 hover:text-stone-700"><Pencil className="w-3.5 h-3.5" /></button>
                </div>

                {isOpen && (
                  <div className="border-t border-stone-100 p-4 space-y-3 bg-stone-50/50">
                    <div className="flex gap-2">
                      <button onClick={() => toggleHidden(item)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${item.is_hidden ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-600"}`}>
                        {item.is_hidden ? "Unhide from buyers" : "Hide from buyers"}
                      </button>
                      <button onClick={() => toggleArchived(item)}
                        className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${item.is_archived ? "bg-stone-200 text-stone-600" : "bg-red-50 text-red-600"}`}>
                        {item.is_archived ? "Restore" : "Archive"}
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-stone-500 uppercase tracking-wide">Add-on Groups</p>
                      <button onClick={() => openGroupCreate(item.id)} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-xs font-semibold" style={{ background: TEAL }}>
                        <Plus className="w-3 h-3" /> Group
                      </button>
                    </div>

                    {item.addon_groups.length === 0 ? (
                      <p className="text-stone-400 text-xs">No add-on groups — this item has no customization options.</p>
                    ) : (
                      <div className="space-y-2">
                        {item.addon_groups.map(g => (
                          <div key={g.id} className="bg-white rounded-xl border border-stone-200 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-semibold text-stone-800 flex-1">{g.name}</span>
                              <span className="text-[10px] text-stone-400">
                                {g.is_required ? "Required" : "Optional"} · {g.min_selections}-{g.max_selections}
                              </span>
                              <button onClick={() => openGroupEdit(item.id, g)} className="p-1 text-stone-400 hover:text-stone-700"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => deleteGroup(g.id)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                            </div>
                            <div className="space-y-1">
                              {g.addons.map(a => (
                                <div key={a.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-stone-50">
                                  <span className="flex-1 text-stone-700">{a.name}</span>
                                  <span className="text-stone-500 font-medium">{Number(a.price_delta) >= 0 ? "+" : ""}₦{Number(a.price_delta).toLocaleString()}</span>
                                  {!a.is_available && <span className="text-[10px] text-red-500 font-semibold">Unavailable</span>}
                                  <button onClick={() => openAddonEdit(g.id, a)} className="p-1 text-stone-400 hover:text-stone-700"><Pencil className="w-3 h-3" /></button>
                                  <button onClick={() => deleteAddon(a.id)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              ))}
                              <button onClick={() => openAddonCreate(g.id)} className="text-xs text-teal-600 font-semibold flex items-center gap-1 px-2 py-1">
                                <Plus className="w-3 h-3" /> Add option
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* ── Category modal ── */}
      {catModal && (
        <Modal title={catModal.editing ? "Edit Category" : "New Category"} onClose={() => setCatModal(null)}>
          <Field label="Name">
            <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Appetizers" />
          </Field>
          <Field label="Display order">
            <input type="number" value={catForm.display_order} onChange={e => setCatForm(f => ({ ...f, display_order: Number(e.target.value) }))} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={catForm.is_active} onChange={e => setCatForm(f => ({ ...f, is_active: e.target.checked }))} /> Active
          </label>
          <SaveButton saving={saving} onClick={saveCategory} />
        </Modal>
      )}

      {/* ── Menu item modal ── */}
      {itemModal && (
        <Modal title={itemModal.editing ? "Edit Menu Item" : "Add to Menu"} onClose={() => setItemModal(null)}>
          <Field label="Category">
            <select value={itemForm.menu_category} onChange={e => setItemForm(f => ({ ...f, menu_category: e.target.value ? Number(e.target.value) : "" }))} className={inputCls}>
              <option value="">Uncategorized</option>
              {sortedCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Prep time (minutes, optional)">
            <input type="number" value={itemForm.prep_time_minutes} onChange={e => setItemForm(f => ({ ...f, prep_time_minutes: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Allergens (comma-separated, optional)">
            <input value={itemForm.allergens} onChange={e => setItemForm(f => ({ ...f, allergens: e.target.value }))} className={inputCls} placeholder="peanuts, dairy" />
          </Field>
          <Field label="Ingredients (optional)">
            <textarea value={itemForm.ingredients} onChange={e => setItemForm(f => ({ ...f, ingredients: e.target.value }))} rows={2} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Available from (optional)">
              <input type="time" value={itemForm.availability_window_start} onChange={e => setItemForm(f => ({ ...f, availability_window_start: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Available until (optional)">
              <input type="time" value={itemForm.availability_window_end} onChange={e => setItemForm(f => ({ ...f, availability_window_end: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={itemForm.is_seasonal} onChange={e => setItemForm(f => ({ ...f, is_seasonal: e.target.checked }))} /> Seasonal item
          </label>
          <SaveButton saving={saving} onClick={saveMenuItem} />
        </Modal>
      )}

      {/* ── Add-on group modal ── */}
      {groupModal && (
        <Modal title={groupModal.editing ? "Edit Add-on Group" : "New Add-on Group"} onClose={() => setGroupModal(null)}>
          <Field label="Name">
            <input value={groupForm.name} onChange={e => setGroupForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Choose your protein" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min selections">
              <input type="number" min={0} value={groupForm.min_selections} onChange={e => setGroupForm(f => ({ ...f, min_selections: Number(e.target.value) }))} className={inputCls} />
            </Field>
            <Field label="Max selections">
              <input type="number" min={1} value={groupForm.max_selections} onChange={e => setGroupForm(f => ({ ...f, max_selections: Number(e.target.value) }))} className={inputCls} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={groupForm.is_required} onChange={e => setGroupForm(f => ({ ...f, is_required: e.target.checked }))} /> Required — buyer must choose
          </label>
          <SaveButton saving={saving} onClick={saveGroup} />
        </Modal>
      )}

      {/* ── Addon modal ── */}
      {addonModal && (
        <Modal title={addonModal.editing ? "Edit Add-on" : "New Add-on"} onClose={() => setAddonModal(null)}>
          <Field label="Name">
            <input value={addonForm.name} onChange={e => setAddonForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Extra Chicken" />
          </Field>
          <Field label="Price (₦ — can be negative to discount, e.g. removing an ingredient)">
            <input type="number" step="0.01" value={addonForm.price_delta} onChange={e => setAddonForm(f => ({ ...f, price_delta: e.target.value }))} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={addonForm.is_available} onChange={e => setAddonForm(f => ({ ...f, is_available: e.target.checked }))} /> Available
          </label>
          <SaveButton saving={saving} onClick={saveAddon} />
        </Modal>
      )}
    </div>
  );
}

const inputCls = "w-full px-4 py-2.5 rounded-xl border border-stone-200 text-stone-900 text-sm focus:outline-none focus:border-teal-500 bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-stone-500 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={saving}
      className="w-full py-3 rounded-full font-bold text-white text-sm disabled:opacity-50 transition" style={{ background: TEAL }}>
      {saving ? "Saving…" : "Save"}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-stone-900 text-lg" style={HEADING_FONT}>{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
