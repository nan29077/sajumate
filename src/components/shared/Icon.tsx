"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowRight,
  LayoutDashboard,
  CalendarClock,
  Landmark,
  Globe,
  Images,
  MessageSquareText,
  Ticket,
  ListChecks,
  Headset,
  SlidersHorizontal,
  Link2,
  BadgeCheck,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileText,
  Gift,
  GripVertical,
  Heart,
  Home,
  Info,
  LogIn,
  LogOut,
  Lock,
  KeyRound,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  BookOpenText,
  Palette,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  Radio,
  ReceiptText,
  Rocket,
  Search,
  Settings,
  Share2,
  Shapes,
  Sparkles,
  Star,
  Store,
  Tag,
  TicketPercent,
  Trash2,
  Upload,
  UserRound,
  UserPlus,
  UserRoundCheck,
  Users,
  Video,
  MonitorPlay,
  MoonStar,
  WalletCards,
  X,
  Zap,
  Copy,
  Menu,
  Percent,
  QrCode,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  alt?: string;
  style?: CSSProperties;
  strokeWidth?: number;
  color?: string;
  fill?: string;
}

const SYSTEM_ICONS: Record<string, LucideIcon> = {
  ArrowRight,
  Calendar: CalendarDays,
  Cart: CalendarClock,
  Camera,
  Category: Shapes,
  Certified: BadgeCheck,
  Chart: BarChart3,
  Check,
  ChevronDown,
  Clock: Clock3,
  Close: X,
  CreditCard,
  CustomerService: MessageCircle,
  Delete: Trash2,
  Discount: Percent,
  Download,
  Edit: Pencil,
  Eye,
  File: FileText,
  Gift,
  Help: CircleHelp,
  Home,
  Info,
  InviteFriend: UserPlus,
  Lightning: Zap,
  Live: Radio,
  Login: LogIn,
  Logout: LogOut,
  Location: MapPin,
  Lock,
  Mail,
  Megaphone,
  Message: MessageCircle,
  MyPage: UserRound,
  MyPick: Heart,
  NetworkError: WifiOff,
  Notification: Bell,
  OrderHistory: ReceiptText,
  Package: BookOpenText,
  ConsultProduct: BookOpenText,
  Pause,
  Phone,
  Play,
  Plus,
  QrCode,
  Receipt: ReceiptText,
  Reorder: GripVertical,
  Rocket,
  Search,
  Settings,
  Share: Share2,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck: CalendarClock,
  Upload,
  UserCheck: UserRoundCheck,
  Users,
  Wallet: WalletCards,
  Warning: AlertTriangle,
  Wishlist: Heart,
  Video,
  LiveSession: MonitorPlay,
  Moon: MoonStar,
  ReservationStatus: CalendarClock,
  OrderManagement: CalendarClock,
  Notice: Megaphone,
  // 레거시 PNG 기능 아이콘을 동일한 Lucide 선형 아이콘으로 정규화한다.
  ChatJoin_icon: MessageCircle,
  SnsComment_icon: MessageCircle,
  ProductDetail_icon: BookOpenText,
  ChatBlock_icon: Lock,
  ProductQA_icon: CircleHelp,
  BuyNow_icon: CalendarClock,
  StreamStats_icon: BarChart3,
  Coupon_icon: TicketPercent,
  Shipping_icon: Info,
  Clock_icon: Clock3,
  EmojiBee_icon: Bot,
  EmojiHoney_icon: MoonStar,
  LiveChat_icon: MessageSquareText,
  Help_icon: CircleHelp,
  EmojiSparkle_icon: Sparkles,
  ProductVideo_icon: Video,
  SnsFeed_icon: Images,
  ProductName_icon: BookOpenText,
  ShortDescription_icon: MessageSquareText,
  ProductThumbnail_icon: Images,
  SnsLiveStream_icon: Radio,
  StreamKey_icon: KeyRound,
  ProductSummary_icon: FileText,
  ProductDetailPage_icon: BookOpenText,
  Broadcast_icon: Radio,
  Studio_icon: Video,
  StreamQuality_icon: SlidersHorizontal,
  Color: Palette,
  Copy,
  Coupon: TicketPercent,
  Menu,
  // ─ 관리자 사이드바 전용 (모두 lucide 라인 아이콘으로 통일) ─
  Dashboard: LayoutDashboard,
  Event: CalendarClock,
  Settlement: Landmark,
  Globe,
  Content: Images,
  Comment: MessageSquareText,
  Coupon2: Ticket,
  Inquiry: ListChecks,
  Support: Headset,
  Operation: SlidersHorizontal,
  LinkShorten_icon: Link2,
};

export function Icon({
  name,
  size = 24,
  className = "",
  alt = "",
  style,
  strokeWidth = 1.8,
  color,
  fill = "none",
}: IconProps) {
  const SystemIcon = SYSTEM_ICONS[name];

  if (SystemIcon) {
    return (
      <SystemIcon
        size={size}
        strokeWidth={strokeWidth}
        className={className}
        style={style}
        color={color}
        fill={fill}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
      />
    );
  }

  // 소셜·플랫폼·특수 일러스트 아이콘은 기존 PNG 자산을 유지한다.
  return (
    <Image
      src={`/icons/${name}.png`}
      width={size}
      height={size}
      alt={alt}
      className={className}
      style={{ display: "inline-block", ...style }}
      unoptimized
    />
  );
}
