import { Handle, Position } from 'reactflow';
import { cn } from '@/lib/utils';
import { FileText, Truck, CreditCard, DollarSign, Package, Users, Building, Activity } from 'lucide-react';

interface CustomNodeProps {
  data: {
    label: string;
    type: string;
    subtitle?: string;
    isHighlighted?: boolean;
    properties?: Record<string, any>;
    analysisStyle?: React.CSSProperties;
  };
  selected: boolean;
}

const TYPE_CONFIG: Record<string, { color: string; icon: any; bg: string }> = {
  SalesOrder: { color: 'text-blue-600', bg: 'bg-blue-50', icon: Package },
  Delivery: { color: 'text-orange-600', bg: 'bg-orange-50', icon: Truck },
  BillingDocument: { color: 'text-purple-600', bg: 'bg-purple-50', icon: FileText },
  AccountingJournal: { color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CreditCard },
  Payment: { color: 'text-teal-600', bg: 'bg-teal-50', icon: DollarSign },
  Customer: { color: 'text-indigo-600', bg: 'bg-indigo-50', icon: Users },
  Plant: { color: 'text-rose-600', bg: 'bg-rose-50', icon: Building },
  Product: { color: 'text-amber-600', bg: 'bg-amber-50', icon: Activity },
};

export function CustomNode({ data, selected }: CustomNodeProps) {
  const tConfig = TYPE_CONFIG[data.type] || { color: 'text-zinc-600', bg: 'bg-zinc-50', icon: FileText };
  const Icon = tConfig.icon;

  return (
    <div
      className={cn(
        "rounded-lg border shadow-sm bg-white w-[180px] transition-all duration-200 overflow-hidden",
        selected ? "border-zinc-900 ring-2 ring-zinc-900/5 shadow-md" : (data.analysisStyle ? "" : "border-zinc-200"),
        data.isHighlighted && !data.analysisStyle ? "border-blue-500 ring-1 ring-blue-500/20" : "",
        !selected && !data.isHighlighted && !data.analysisStyle ? "hover:border-zinc-400" : ""
      )}
      style={data.analysisStyle}
    >
      <Handle type="target" position={Position.Left} className="w-1.5 h-1.5 !bg-zinc-400 border-none -left-[4px]" />
      
      <div className="flex flex-col">
        {/* Header Bar */}
        <div className={cn("px-2 py-1.5 flex items-center gap-2 border-b border-zinc-50", tConfig.bg)}>
          <Icon className={cn("w-3.5 h-3.5", tConfig.color)} />
          <span className="text-[9px] font-bold uppercase tracking-tight text-zinc-500 truncate">
            {data.type.replace("Header", "").replace("Document", "")}
          </span>
        </div>

        {/* Label Area */}
        <div className="px-2 py-2">
          <div className="text-[11px] font-semibold text-zinc-900 truncate" title={data.label}>
            {data.label}
          </div>
          {data.subtitle && (
            <div className="text-[9px] text-zinc-500 truncate mt-0.5">
              {data.subtitle}
            </div>
          )}
        </div>
        
        {/* Detail Indicator */}
        {data.properties && Object.keys(data.properties).length > 0 && (
          <div className="px-2 pb-1.5 flex gap-1">
            <div className="px-1 py-0.5 rounded bg-zinc-100 text-[8px] text-zinc-500 font-medium">
              Details
            </div>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="w-1.5 h-1.5 !bg-zinc-400 border-none -right-[4px]" />
    </div>
  );
}
