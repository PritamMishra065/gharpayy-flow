import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, UserCircle2, Building2, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';

export default function PublicAccountNav() {
  const navigate = useNavigate();
  const { user, userContext, signOut } = useAuth();
  const [ownerSwitchOpen, setOwnerSwitchOpen] = useState(false);

  const displayName = useMemo(() => {
    if (!user) return '';
    const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
    return metaName || user.email || 'Account';
  }, [user]);

  const handleOwnerClick = () => {
    if (!user) {
      navigate('/auth?redirect=/owner-portal');
      return;
    }

    if (userContext.isOwner) {
      navigate('/owner-portal');
      return;
    }

    setOwnerSwitchOpen(true);
  };

  const handleSignOutAndSwitch = async () => {
    await signOut();
    setOwnerSwitchOpen(false);
    navigate('/auth?redirect=/owner-portal', { replace: true });
  };

  if (!user) {
    return (
      <Button variant="outline" size="sm" onClick={() => navigate('/auth')}>
        Login
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 max-w-[220px]">
            <UserCircle2 size={16} />
            <span className="truncate">{displayName}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="space-y-1">
            <div className="text-sm font-medium truncate">{displayName}</div>
            <div className="text-xs text-muted-foreground font-normal truncate">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate(userContext.defaultPath || '/explore')}>
            <LayoutDashboard size={14} className="mr-2" />
            Open my account
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleOwnerClick}>
            <Building2 size={14} className="mr-2" />
            Owner portal
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void handleSignOutAndSwitch()}>
            <LogOut size={14} className="mr-2" />
            Logout and use another account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={ownerSwitchOpen} onOpenChange={setOwnerSwitchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>This account is not an owner account</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You are signed in as {displayName}. To open the owner portal, sign out and log in with the correct owner account.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOwnerSwitchOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => void handleSignOutAndSwitch()}>
              Logout and login as owner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
