import { useEffect, useRef, useState } from 'react';
import { X, Send, Bot, User, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSubmitPropertyInquiry } from '@/hooks/usePublicData';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot' | 'agent';
  text: string;
  time: string;
}

const FAQ_RESPONSES: Record<string, string> = {
  food: 'Most of our PGs offer home-cooked meals included in the rent. Please check the amenities section for the exact property setup.',
  rent: 'Rent varies by room type and sharing. You can see the exact per-bed pricing in the Available Rooms section above.',
  wifi: 'Yes, verified properties include WiFi. Speeds and plans can vary a bit by property.',
  deposit: 'Security deposit is usually 1-2 months of rent, refundable at move-out based on the property policy.',
  'move-in': 'You can often move in within 24 to 48 hours after booking confirmation, depending on bed availability.',
  laundry: 'Laundry availability depends on the property. Many PGs include machines or add-on laundry service.',
  security: 'Verified Gharpayy properties include managed access and standard safety measures such as CCTV or guards.',
  cleaning: 'Room cleaning is generally scheduled multiple times each week, while common areas are cleaned more frequently.',
  rules: 'Each property has its own visitor and quiet-hours policy. We recommend confirming this with the advisor before booking.',
  available: 'Live bed availability is shown in the Available Rooms section above.',
};

const getAutoResponse = (message: string): string | null => {
  const lower = message.toLowerCase();
  for (const [key, response] of Object.entries(FAQ_RESPONSES)) {
    if (lower.includes(key)) return response;
  }
  if (lower.includes('price') || lower.includes('cost') || lower.includes('charge')) return FAQ_RESPONSES.rent;
  if (lower.includes('internet') || lower.includes('broadband')) return FAQ_RESPONSES.wifi;
  if (lower.includes('safe') || lower.includes('guard')) return FAQ_RESPONSES.security;
  return null;
};

interface PersistentPropertyChatProps {
  propertyId: string;
  propertyName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function PersistentPropertyChat({
  propertyId,
  propertyName,
  isOpen,
  onClose,
}: PersistentPropertyChatProps) {
  const submitInquiry = useSubmitPropertyInquiry();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'bot',
      text: `Hi! I'm here to help you with ${propertyName}. Share your details once and your messages will be saved for the Gharpayy team too.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [contact, setContact] = useState({ name: '', phone: '', email: '' });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const quickQuestions = ['What about food?', 'Is WiFi included?', 'Security details?', 'Move-in process?'];

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    if (!contact.name.trim() || !contact.phone.trim()) {
      toast.error('Please enter your name and phone so our team can follow up.');
      return;
    }

    const trimmed = text.trim();
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: trimmed,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      await submitInquiry.mutateAsync({
        property_id: propertyId,
        inquiry_type: 'chat',
        customer_name: contact.name.trim(),
        customer_phone: contact.phone.trim(),
        customer_email: contact.email.trim() || undefined,
        message: trimmed,
      });

      const auto = getAutoResponse(trimmed);
      const reply: ChatMessage = {
        id: `${Date.now()}-reply`,
        role: auto ? 'bot' : 'agent',
        text: auto || "Thanks, your message is now in our CRM. A Gharpayy advisor will follow up with you shortly on chat or WhatsApp.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, reply]);
    } catch (error: any) {
      toast.error(error.message || 'Could not send your message.');
      setMessages((prev) => prev.filter((message) => message.id !== userMsg.id));
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-xl flex flex-col overflow-hidden"
          style={{ height: 560 }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                <span className="text-accent-foreground font-bold text-xs">G</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Gharpayy Support</p>
                <p className="text-[10px] text-success flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" /> Online
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X size={16} className="text-muted-foreground" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div className="rounded-xl border border-border p-3 space-y-2 bg-secondary/30">
              <p className="text-[11px] font-medium text-foreground">Save this chat to CRM</p>
              <Input
                value={contact.name}
                onChange={(e) => setContact((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Your name"
                className="h-9 text-sm"
              />
              <Input
                value={contact.phone}
                onChange={(e) => setContact((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone / WhatsApp"
                className="h-9 text-sm"
              />
              <Input
                value={contact.email}
                onChange={(e) => setContact((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email (optional)"
                className="h-9 text-sm"
              />
            </div>

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'flex gap-2'}`}>
                  {msg.role !== 'user' && (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${msg.role === 'bot' ? 'bg-accent/10' : 'bg-info/10'}`}>
                      {msg.role === 'bot' ? <Bot size={12} className="text-accent" /> : <User size={12} className="text-info" />}
                    </div>
                  )}
                  <div>
                    <div className={`px-3 py-2 rounded-xl text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-accent text-accent-foreground rounded-br-md'
                        : 'bg-secondary text-foreground rounded-bl-md'
                    }`}>
                      {msg.text}
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-0.5 px-1">{msg.time}</p>
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center">
                  <Bot size={12} className="text-accent" />
                </div>
                <div className="px-3 py-2 rounded-xl bg-secondary">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {messages.length <= 2 && (
            <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
              {quickQuestions.map((question) => (
                <button
                  key={question}
                  onClick={() => void sendMessage(question)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          )}

          <div className="px-3 py-2.5 border-t border-border flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void sendMessage(input)}
              placeholder="Ask about this PG..."
              className="h-9 text-sm"
            />
            <Button
              size="sm"
              className="h-9 w-9 p-0 bg-accent hover:bg-accent/90"
              onClick={() => void sendMessage(input)}
              disabled={submitInquiry.isPending}
            >
              <Send size={14} className="text-accent-foreground" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
