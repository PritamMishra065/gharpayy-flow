import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Building2, Bed, CheckCircle2, Clock, TrendingUp, Users,
  LogOut, RefreshCw, AlertTriangle, IndianRupee, BarChart3, Home,
  ImagePlus, X, Loader2, Upload, ChevronDown, ChevronUp, Plus
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUpdateBed, useCreateRoom } from '@/hooks/useInventoryData';

// Hook: Fetch owner by user_id
function useOwnerByUser(userId: string | undefined) {
  return useQuery({
    queryKey: ['owner-by-user', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('owners')
        .select('*')
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

// Hook: Properties with rooms/beds for an owner
function useOwnerProperties(ownerId: string | undefined) {
  return useQuery({
    queryKey: ['owner-properties', ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*, rooms(*, beds(*))')
        .eq('owner_id', ownerId!)
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

// Hook: Bookings for owner properties
function useOwnerBookings(propertyIds: string[]) {
  return useQuery({
    queryKey: ['owner-bookings', propertyIds],
    enabled: propertyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, leads(name, phone), rooms(room_number), beds(bed_number), properties(name)')
        .in('property_id', propertyIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// Hook: Effort data for a property
function usePropertyEffort(propertyId: string | undefined) {
  return useQuery({
    queryKey: ['property-effort', propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_property_effort', {
        p_property_id: propertyId!,
      });
      if (error) throw error;
      return data as any;
    },
  });
}

// Hook: Confirm room status
function useConfirmRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { room_id: string; status: string; confirmed_by?: string; notes?: string }) => {
      const { data, error } = await supabase.from('room_status_log').insert({
        room_id: params.room_id,
        status: params.status as any,
        confirmed_by: params.confirmed_by || null,
        notes: params.notes || null,
        rent_updated: false,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-properties'] });
      toast.success('Room status confirmed');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

const STATUS_COLORS: Record<string, string> = {
  vacant: 'bg-success/10 text-success border-success/20',
  occupied: 'bg-info/10 text-info border-info/20',
  vacating: 'bg-warning/10 text-warning border-warning/20',
  blocked: 'bg-destructive/10 text-destructive border-destructive/20',
};

const BED_STATUS_COLORS: Record<string, string> = {
  vacant: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  occupied: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  vacating_soon: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  blocked: 'bg-destructive/10 text-destructive border-destructive/20',
  reserved: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  booked: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
};

const BOOKING_COLORS: Record<string, string> = {
  pending: 'bg-warning/10 text-warning',
  confirmed: 'bg-success/10 text-success',
  cancelled: 'bg-destructive/10 text-destructive',
  checked_in: 'bg-info/10 text-info',
  checked_out: 'bg-muted text-muted-foreground',
};

export default function OwnerPortal() {
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut, userContext } = useAuth();
  const { data: owner, isLoading: ownerLoading, error: ownerError } = useOwnerByUser(user?.id);
  const { data: properties } = useOwnerProperties(owner?.id);
  const propertyIds = properties?.map((p: any) => p.id) || [];
  const { data: bookings } = useOwnerBookings(propertyIds);
  const confirmRoom = useConfirmRoom();

  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [confirmDialog, setConfirmDialog] = useState<any>(null);
  const [confirmStatus, setConfirmStatus] = useState('vacant');
  const [confirmNotes, setConfirmNotes] = useState('');

  // If not logged in, redirect to auth
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth?redirect=/owner-portal');
    }
  }, [authLoading, user, navigate]);

  const handleSwitchOwnerAccount = async () => {
    await signOut();
    navigate('/auth?redirect=/owner-portal', { replace: true });
  };

  if (authLoading || ownerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading owner portal...</div>
      </div>
    );
  }

  if (user && !userContext.isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <AlertTriangle size={40} className="mx-auto mb-4 text-warning" />
            <h2 className="text-xl font-semibold mb-2">Owner account required</h2>
            <p className="text-sm text-muted-foreground mb-6">
              You are logged in with a non-owner account. Sign out and log in with the correct owner account to open the owner portal.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => void handleSwitchOwnerAccount()}>
                Sign out and login as owner
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <AlertTriangle size={40} className="mx-auto mb-4 text-warning" />
            <h2 className="text-xl font-semibold mb-2">No Owner Account Found</h2>
            <p className="text-sm text-muted-foreground mb-6">
              This login is marked as an owner account, but it is not yet linked to any owner profile. You can sign out and try another owner login, or contact the Gharpayy team to finish setup.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
              <Button onClick={() => void handleSwitchOwnerAccount()}>Sign Out</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Stats
  const filteredProps = selectedProperty === 'all'
    ? properties || []
    : properties?.filter((p: any) => p.id === selectedProperty) || [];

  const totalRooms = filteredProps.reduce((s: number, p: any) => s + (p.rooms?.length || 0), 0);
  const totalBeds = filteredProps.reduce((s: number, p: any) =>
    s + (p.rooms || []).reduce((rs: number, r: any) => rs + (r.beds?.length || 0), 0), 0);
  const vacantBeds = filteredProps.reduce((s: number, p: any) =>
    s + (p.rooms || []).reduce((rs: number, r: any) =>
      rs + (r.beds || []).filter((b: any) => b.status === 'vacant').length, 0), 0);
  const occupiedBeds = filteredProps.reduce((s: number, p: any) =>
    s + (p.rooms || []).reduce((rs: number, r: any) =>
      rs + (r.beds || []).filter((b: any) => b.status === 'occupied').length, 0), 0);

  const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

  const handleConfirm = async () => {
    if (!confirmDialog) return;
    await confirmRoom.mutateAsync({
      room_id: confirmDialog.id,
      status: confirmStatus,
      confirmed_by: owner.id,
      notes: confirmNotes || undefined,
    });
    setConfirmDialog(null);
    setConfirmNotes('');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <span className="text-accent-foreground font-bold text-sm">G</span>
              </div>
              <div>
                <span className="font-semibold text-base tracking-tight text-foreground">Gharpayy</span>
                <span className="text-xs text-muted-foreground ml-2">Owner Portal</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:block">Welcome, {owner.name}</span>
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <Home size={16} className="mr-1" /> Home
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleSwitchOwnerAccount()}>
                <LogOut size={14} className="mr-1" /> Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title + Property Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Property Dashboard</h1>
            <p className="text-sm text-muted-foreground">{owner.name}{owner.company_name ? ` · ${owner.company_name}` : ''}</p>
          </div>
          <Select value={selectedProperty} onValueChange={setSelectedProperty}>
            <SelectTrigger className="w-64">
              <Building2 size={14} className="mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Properties ({properties?.length || 0})</SelectItem>
              {properties?.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Properties', value: filteredProps.length, icon: Building2, color: 'text-accent' },
            { label: 'Total Beds', value: totalBeds, icon: Bed, color: 'text-info' },
            { label: 'Vacant Beds', value: vacantBeds, icon: CheckCircle2, color: 'text-success' },
            { label: 'Occupancy Rate', value: `${occupancyRate}%`, icon: TrendingUp, color: 'text-warning' },
          ].map((kpi) => (
            <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <kpi.icon size={16} className={kpi.color} />
                    <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  </div>
                  <p className="text-2xl font-semibold">{kpi.value}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="rooms" className="space-y-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="rooms">Rooms & Status</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="effort">Effort Report</TabsTrigger>
          </TabsList>

          {/* Rooms Tab */}
          <TabsContent value="rooms" className="space-y-4">
            {filteredProps.map((property: any) => (
              <Card key={property.id}>
                <CardHeader className="pb-3 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg mb-1">{property.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{property.area}, {property.city}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{totalRooms} Rooms</Badge>
                      <AddRoomDialog propertyId={property.id} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    {(property.rooms || []).map((room: any) => {
                      const vacant = (room.beds || []).filter((b: any) => b.status === 'vacant').length;
                      const stale = room.last_confirmed_at
                        ? new Date().getTime() - new Date(room.last_confirmed_at).getTime() > 24 * 60 * 60 * 1000
                        : true;
                      return (
                        <div key={room.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-secondary/30 transition-colors">
                          <div className="flex items-center gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">Room {room.room_number}</span>
                                {room.room_type && <Badge variant="outline" className="text-2xs">{room.room_type}</Badge>}
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                <span>{room.bed_count} beds mapped</span>
                                <span className="text-success">{vacant} vacant</span>
                                {room.rent_per_bed && <span>₹{room.rent_per_bed.toLocaleString()}/bed</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`text-2xs border ${STATUS_COLORS[room.status] || 'bg-muted'}`}>
                              {room.status}
                            </Badge>
                            {stale && (
                              <Badge variant="outline" className="text-2xs text-warning border-warning/30 gap-1">
                                <Clock size={10} /> Needs confirmation
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs"
                              onClick={() => {
                                setConfirmDialog(room);
                                setConfirmStatus(room.status);
                              }}
                            >
                              <RefreshCw size={12} /> Confirm
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Property Photos and Beds Management injected here */}
                  <PropertyPanel property={property} />
                  
                </CardContent>
              </Card>
            ))}
            {filteredProps.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Building2 size={40} className="mx-auto mb-3 opacity-40" />
                <p>No properties found</p>
              </div>
            )}
          </TabsContent>

          {/* Bookings Tab */}
          <TabsContent value="bookings">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Bookings</CardTitle>
              </CardHeader>
              <CardContent>
                {bookings?.length ? (
                  <div className="space-y-3">
                    {bookings.map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                        <div>
                          <p className="font-medium text-sm">{(b.leads as any)?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">
                            {(b.properties as any)?.name} · Room {(b.rooms as any)?.room_number} · Bed {(b.beds as any)?.bed_number}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {b.move_in_date && `Move-in: ${b.move_in_date}`}
                            {b.monthly_rent && ` · ₹${b.monthly_rent.toLocaleString()}/mo`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-2xs ${BOOKING_COLORS[b.booking_status] || ''}`}>
                            {b.booking_status}
                          </Badge>
                          <Badge variant="outline" className="text-2xs">
                            {b.payment_status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users size={32} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No bookings yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Effort Tab */}
          <TabsContent value="effort">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProps.map((property: any) => (
                <EffortCard key={property.id} property={property} />
              ))}
            </div>
            {filteredProps.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <BarChart3 size={40} className="mx-auto mb-3 opacity-40" />
                <p>No properties to show effort for</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirm Room Status Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Room Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Room {confirmDialog?.room_number} · {confirmDialog?.bed_count} beds
            </p>
            <div>
              <Label className="text-xs">Current Status</Label>
              <Select value={confirmStatus} onValueChange={setConfirmStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacant">Vacant</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="vacating">Vacating</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                placeholder="Any updates..."
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              onClick={handleConfirm}
              disabled={confirmRoom.isPending}
              className="bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              {confirmRoom.isPending ? 'Confirming...' : 'Confirm Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-component for effort per property
function EffortCard({ property }: { property: any }) {
  const { data: effort } = usePropertyEffort(property.id);

  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="font-semibold text-sm mb-1">{property.name}</h3>
        <p className="text-xs text-muted-foreground mb-4">{property.area}</p>
        {effort ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total Leads', value: (effort as any).total_leads, color: 'text-foreground' },
              { label: 'Total Visits', value: (effort as any).total_visits, color: 'text-info' },
              { label: 'Booked', value: (effort as any).booked, color: 'text-success' },
              { label: 'Not Interested', value: (effort as any).not_interested, color: 'text-destructive' },
            ].map((s) => (
              <div key={s.label} className="text-center p-2 rounded-lg bg-secondary/50">
                <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
                <p className="text-2xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-xs text-muted-foreground">Loading effort data...</div>
        )}
      </CardContent>
    </Card>
  );
}

function PropertyPanel({ property }: { property: any }) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);

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
      qc.invalidateQueries({ queryKey: ['owner-properties'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveImage = async (url: string) => {
    const updated = (property.photos || []).filter((u: string) => u !== url);
    const { error } = await supabase.from('properties').update({ photos: updated }).eq('id', property.id);
    if (error) toast.error(error.message);
    else { toast.success('Image removed'); qc.invalidateQueries({ queryKey: ['owner-properties'] }); }
  };

  return (
    <div className="mt-8 border-t pt-6 space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground tracking-tight">Property Photos</p>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              {uploading ? 'Uploading...' : 'Add Photos'}
            </Button>
          </div>
        </div>
        {property.photos?.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            {property.photos.map((url: string, idx: number) => (
              <div key={idx} className="relative group">
                <img src={url} alt={`photo-${idx}`} className="w-full h-28 object-cover rounded-xl border" />
                <button
                  onClick={() => handleRemoveImage(url)}
                  className="absolute top-1.5 right-1.5 bg-black/70 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={14} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 w-full border-2 border-dashed border-border rounded-xl p-10 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all bg-secondary/30"
          >
            <Upload size={28} className="opacity-50" />
            <span className="text-sm font-medium">Click to upload property photos (Max 5MB)</span>
          </button>
        )}
      </div>

      <div className="space-y-4">
        <p className="text-sm font-semibold text-foreground tracking-tight">Manage Beds</p>
        {!property.rooms?.length ? (
          <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-4 text-center">No rooms yet to manage beds.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {property.rooms.map((room: any) => (
              <RoomBedsRow
                key={room.id}
                room={room}
                expanded={expandedRoom === room.id}
                onToggle={() => setExpandedRoom(expandedRoom === room.id ? null : room.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoomBedsRow({ room, expanded, onToggle }: { room: any; expanded: boolean; onToggle: () => void }) {
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
      qc.invalidateQueries({ queryKey: ['owner-properties'] });
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
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col h-fit">
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 text-left border-b border-transparent hover:bg-secondary/40 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bed size={15} className="text-primary" />
          </div>
          <div>
            <span className="text-sm font-semibold">Room {room.room_number}</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-muted-foreground font-medium">{room.beds?.length || 0} Beds Mapped</span>
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 bg-secondary/15 pt-4 border-t border-border/50">
          <div className="space-y-2">
            {room.beds?.map((bed: any) => (
              <div key={bed.id} className="flex flex-col gap-2 p-3 rounded-xl bg-background border hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center shrink-0">
                    <Bed size={12} className="text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium flex-1">{bed.bed_number}</span>
                </div>
                <Select value={bed.status} onValueChange={(v) => handleBedStatusChange(bed.id, v)}>
                  <SelectTrigger className={`h-8 w-full border ${BED_STATUS_COLORS[bed.status] || ''}`}>
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
            {!room.beds?.length && (
              <p className="text-sm text-foreground italic text-center py-3 opacity-50">No beds mapped.</p>
            )}
          </div>

          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">New Bed Number</Label>
              <Input
                placeholder="Ex. B1"
                value={bedForm.bed_number}
                onChange={e => setBedForm(f => ({ ...f, bed_number: e.target.value }))}
                className="h-9 bg-background"
              />
            </div>
            <Button
              size="sm"
              className="h-9 w-full"
              onClick={handleAddBed}
              disabled={addingBed}
            >
              {addingBed ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Plus size={15} className="mr-1.5" />}
              Add Bed to Room {room.room_number}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddRoomDialog({ propertyId }: { propertyId: string }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    room_number: '',
    bed_count: 1,
    floor: '',
    rent_per_bed: '',
    room_type: 'Standard',
  });

  const createRoom = useCreateRoom();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.room_number.trim()) {
      toast.error('Room number is required');
      return;
    }
    setAdding(true);
    try {
      await createRoom.mutateAsync({
        property_id: propertyId,
        room_number: form.room_number.trim(),
        bed_count: form.bed_count,
        floor: form.floor.trim() || null,
        rent_per_bed: form.rent_per_bed ? Number(form.rent_per_bed) : null,
        room_type: form.room_type,
        status: 'vacant',
      });
      setOpen(false);
      setForm({ room_number: '', bed_count: 1, floor: '', rent_per_bed: '', room_type: 'Standard' });
    } catch (err: any) {
      // toast shown by mutation
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 ml-2">
          <Plus size={14} /> Add Room
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Room</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="roomNum">Room Number *</Label>
              <Input
                id="roomNum"
                placeholder="e.g. 101"
                value={form.room_number}
                onChange={(e) => setForm(f => ({ ...f, room_number: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floor">Floor (Optional)</Label>
              <Input
                id="floor"
                placeholder="e.g. Ground"
                value={form.floor}
                onChange={(e) => setForm(f => ({ ...f, floor: e.target.value }))}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="beds">Total Beds</Label>
              <Input
                id="beds"
                type="number"
                min="1"
                max="10"
                value={form.bed_count}
                onChange={(e) => setForm(f => ({ ...f, bed_count: parseInt(e.target.value) || 1 }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rent">Rent per Bed (₹)</Label>
              <Input
                id="rent"
                type="number"
                placeholder="0"
                value={form.rent_per_bed}
                onChange={(e) => setForm(f => ({ ...f, rent_per_bed: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Room Type</Label>
            <Select value={form.room_type} onValueChange={(v) => setForm(f => ({ ...f, room_type: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['Standard', 'Premium', 'Deluxe', 'Suite'].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={adding}>
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Room
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
