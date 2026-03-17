import { useState, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOwners, useCreateOwner, useRooms, useBeds, useUpdateBed } from '@/hooks/useInventoryData';
import { usePropertiesWithOwners } from '@/hooks/useInventoryData';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Building2, Phone, Mail, Search, ChevronDown, ChevronUp, Bed, ImagePlus, X, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

/* ─── Bed Status badge colours ─── */
const BED_STATUS_COLORS: Record<string, string> = {
  vacant: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  occupied: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  vacating_soon: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  blocked: 'bg-destructive/10 text-destructive border-destructive/20',
  reserved: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  booked: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
};

/* ─── Property panel: rooms + beds + image upload ─── */
function PropertyPanel({ property }: { property: any }) {
  const { data: rooms } = useRooms(property.id);
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);

  /* Upload new images and append to property.photos */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const validFiles = files.filter(f => f.size <= 5 * 1024 * 1024);
    if (validFiles.length < files.length) toast.warning('Files over 5 MB skipped');
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of validFiles) {
        const ext = file.name.split('.').pop();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('property-images').upload(path, file, { upsert: false });
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('property-images').getPublicUrl(path);
        newUrls.push(publicUrl);
      }
      const existing: string[] = property.photos || [];
      const { error } = await supabase
        .from('properties')
        .update({ photos: [...existing, ...newUrls] })
        .eq('id', property.id);
      if (error) throw error;
      toast.success(`${newUrls.length} image${newUrls.length > 1 ? 's' : ''} added`);
      qc.invalidateQueries({ queryKey: ['properties'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  /* Remove a specific image */
  const handleRemoveImage = async (url: string) => {
    const updated = (property.photos || []).filter((u: string) => u !== url);
    const { error } = await supabase.from('properties').update({ photos: updated }).eq('id', property.id);
    if (error) toast.error(error.message);
    else { toast.success('Image removed'); qc.invalidateQueries({ queryKey: ['properties'] }); }
  };

  return (
    <div className="mt-3 border-t pt-3 space-y-4">
      {/* Images */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Photos</p>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] gap-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={11} className="animate-spin" /> : <ImagePlus size={11} />}
              {uploading ? 'Uploading...' : 'Add Photos'}
            </Button>
          </div>
        </div>
        {property.photos?.length > 0 ? (
          <div className="grid grid-cols-4 gap-1.5">
            {property.photos.map((url: string, idx: number) => (
              <div key={idx} className="relative group">
                <img src={url} alt={`photo-${idx}`} className="w-full h-16 object-cover rounded-lg border" />
                <button
                  onClick={() => handleRemoveImage(url)}
                  className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={9} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 w-full border-2 border-dashed border-border rounded-lg p-3 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            <Upload size={13} /> Click to upload property photos
          </button>
        )}
      </div>

      {/* Rooms & Beds */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Rooms & Beds</p>
        {!rooms?.length ? (
          <p className="text-[10px] text-muted-foreground italic">No rooms yet — add rooms in Inventory</p>
        ) : (
          rooms.map((room: any) => (
            <RoomBedsRow
              key={room.id}
              room={room}
              expanded={expandedRoom === room.id}
              onToggle={() => setExpandedRoom(expandedRoom === room.id ? null : room.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Single room row with its beds ─── */
function RoomBedsRow({ room, expanded, onToggle }: { room: any; expanded: boolean; onToggle: () => void }) {
  const { data: beds } = useBeds(room.id);
  const updateBed = useUpdateBed();
  const qc = useQueryClient();
  const [addingBed, setAddingBed] = useState(false);
  const [bedForm, setBedForm] = useState({ bed_number: '', notes: '' });

  const handleAddBed = async () => {
    if (!bedForm.bed_number.trim()) { toast.error('Bed number required'); return; }
    setAddingBed(true);
    try {
      const { error } = await supabase.from('beds').insert({
        room_id: room.id,
        bed_number: bedForm.bed_number.trim(),
        notes: bedForm.notes.trim() || null,
        status: 'vacant',
      });
      if (error) throw error;
      toast.success('Bed added');
      setBedForm({ bed_number: '', notes: '' });
      qc.invalidateQueries({ queryKey: ['beds'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddingBed(false);
    }
  };

  const handleBedStatusChange = async (bedId: string, status: string) => {
    await updateBed.mutateAsync({ id: bedId, status });
  };

  return (
    <div className="rounded-lg border bg-secondary/30">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Bed size={12} className="text-muted-foreground" />
          <span className="text-xs font-medium">Room {room.room_number}</span>
          {room.floor && <span className="text-[10px] text-muted-foreground">· {room.floor}</span>}
          <Badge className="text-[9px] h-4 px-1.5">{beds?.length || 0} beds</Badge>
        </div>
        {expanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t">
          {/* Beds list */}
          <div className="space-y-1.5 mt-2">
            {beds?.map((bed: any) => (
              <div key={bed.id} className="flex items-center gap-2 p-2 rounded-lg bg-background border">
                <Bed size={11} className="text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium flex-1">{bed.bed_number}</span>
                {bed.current_tenant_name && (
                  <span className="text-[10px] text-muted-foreground">{bed.current_tenant_name}</span>
                )}
                <Select value={bed.status} onValueChange={(v) => handleBedStatusChange(bed.id, v)}>
                  <SelectTrigger className={`h-6 w-28 text-[10px] border ${BED_STATUS_COLORS[bed.status] || ''}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacant" className="text-xs">Vacant</SelectItem>
                    <SelectItem value="occupied" className="text-xs">Occupied</SelectItem>
                    <SelectItem value="vacating_soon" className="text-xs">Vacating Soon</SelectItem>
                    <SelectItem value="reserved" className="text-xs">Reserved</SelectItem>
                    <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
            {!beds?.length && (
              <p className="text-[10px] text-muted-foreground italic text-center py-1">No beds in this room</p>
            )}
          </div>

          {/* Add bed form */}
          <div className="flex items-end gap-2 pt-1 border-t">
            <div className="space-y-1 flex-1">
              <Label className="text-[10px]">Bed # *</Label>
              <Input
                placeholder="e.g. B3"
                value={bedForm.bed_number}
                onChange={e => setBedForm(f => ({ ...f, bed_number: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1 flex-1">
              <Label className="text-[10px]">Notes</Label>
              <Input
                placeholder="Optional"
                value={bedForm.notes}
                onChange={e => setBedForm(f => ({ ...f, notes: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="h-8 text-xs gap-1 flex-shrink-0"
              onClick={handleAddBed}
              disabled={addingBed}
            >
              {addingBed ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
              Add Bed
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Owners page ─── */
const Owners = () => {
  const { data: owners, isLoading } = useOwners();
  const { data: properties } = usePropertiesWithOwners();
  const createOwner = useCreateOwner();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [expandedOwner, setExpandedOwner] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', company_name: '', notes: '' });

  const filtered = owners?.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.phone.includes(search) ||
    (o.email && o.email.toLowerCase().includes(search.toLowerCase()))
  );

  const getOwnerProperties = (ownerId: string) =>
    properties?.filter((p: any) => p.owner_id === ownerId) || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { toast.error('Name and phone required'); return; }
    await createOwner.mutateAsync({
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      company_name: form.company_name.trim() || null,
      notes: form.notes.trim() || null,
    });
    setOpen(false);
    setForm({ name: '', phone: '', email: '', company_name: '', notes: '' });
  };

  return (
    <AppLayout title="Owners" subtitle="Manage property owners and their portfolios">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus size={14} /> Add Owner</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader><DialogTitle className="font-display">Add Owner</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-3 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Name *</Label><Input placeholder="Owner name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="space-y-1"><Label className="text-xs">Phone *</Label><Input placeholder="+91 98765 43210" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Email</Label><Input type="email" placeholder="email@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="space-y-1"><Label className="text-xs">Company</Label><Input placeholder="Company name" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} /></div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={createOwner.isPending}>{createOwner.isPending ? 'Creating...' : 'Add Owner'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search owners..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : !filtered?.length ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No owners yet</p>
            <p className="text-xs mt-1">Add your first property owner to get started</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(owner => {
              const ownerProps = getOwnerProperties(owner.id);
              const isExpanded = expandedOwner === owner.id;
              return (
                <div key={owner.id} className="p-4 rounded-xl border bg-card hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{owner.name}</h3>
                      {owner.company_name && <p className="text-xs text-muted-foreground">{owner.company_name}</p>}
                    </div>
                    <Badge variant={owner.is_active ? 'default' : 'secondary'} className="text-[10px]">
                      {owner.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone size={12} /> {owner.phone}
                    </div>
                    {owner.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail size={12} /> {owner.email}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Building2 size={12} /> {ownerProps.length} {ownerProps.length === 1 ? 'property' : 'properties'}
                    </div>
                  </div>

                  {/* Expand/Collapse properties */}
                  {ownerProps.length > 0 && (
                    <button
                      className="mt-3 w-full flex items-center justify-center gap-1 text-[10px] text-primary hover:underline"
                      onClick={() => setExpandedOwner(isExpanded ? null : owner.id)}
                    >
                      {isExpanded ? <><ChevronUp size={12} /> Hide properties</> : <><ChevronDown size={12} /> Manage properties ({ownerProps.length})</>}
                    </button>
                  )}

                  {isExpanded && (
                    <div className="space-y-3">
                      {ownerProps.map((prop: any) => (
                        <div key={prop.id} className="mt-2 p-3 rounded-lg border bg-secondary/20">
                          <p className="text-xs font-semibold">{prop.name}</p>
                          {(prop.area || prop.city) && (
                            <p className="text-[10px] text-muted-foreground">{[prop.area, prop.city].filter(Boolean).join(', ')}</p>
                          )}
                          <PropertyPanel property={prop} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Owners;
