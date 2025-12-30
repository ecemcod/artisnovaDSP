import React, { useEffect, useRef } from 'react';
import { X, CheckCircle2, Info, Settings2, Target, Speaker, Zap, Asterisk } from 'lucide-react';

interface SignalNode {
    type: string;
    description: string;
    details?: string;
    status?: string;
}

interface SignalPathPopoverProps {
    isOpen: boolean;
    onClose: () => void;
    nodes: SignalNode[];
    quality?: string;
    anchorRect?: DOMRect;
    nowPlayingRect?: DOMRect;
    secondaryRect?: DOMRect;
}

const SignalPathPopover: React.FC<SignalPathPopoverProps> = ({ isOpen, onClose, nodes, quality, anchorRect, nowPlayingRect, secondaryRect }) => {
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const getNodeIcon = (type: string, description: string) => {
        if (description.includes('CamillaDSP')) return <Zap className="text-accent-primary" size={16} />;
        if (description.includes('BlackHole')) return <Settings2 className="text-themed-muted" size={16} />;
        if (description.includes('D50 III')) return <Target className="text-accent-primary" size={16} />;

        switch (type) {
            case 'source': return <Info className="text-themed-muted" size={16} />;
            case 'output': return <Speaker className="text-themed-muted" size={16} />;
            case 'dsp': return <Settings2 className="text-accent-primary" size={16} />;
            default: return <CheckCircle2 className="text-themed-muted" size={16} />;
        }
    };

    const getQualityColor = (quality?: string) => {
        switch (quality) {
            case 'lossless': return 'bg-[#9b59b6]';
            case 'high_quality': return 'bg-[#2ecc71]';
            default: return 'bg-[#f1c40f]';
        }
    };

    // Smart Positioning Logic
    let popoverWidth = 400;

    // Default left position: to the left of the asterisk button
    let left = anchorRect ? (anchorRect.left - popoverWidth - 10) : (window.innerWidth / 2 - popoverWidth / 2);

    // Constraint 1: Left boundary (Always respect Now Playing left edge)
    const minLeft = nowPlayingRect ? (nowPlayingRect.left + 10) : 10;
    left = Math.max(left, minLeft);

    // Constraint 2: Right boundary (Avoid secondary panel)
    const maxRight = secondaryRect ? (secondaryRect.left - 10) : (window.innerWidth - 10);

    // If popover overflows the right boundary, shift it left
    if (left + popoverWidth > maxRight) {
        left = maxRight - popoverWidth;

        // If shifting left makes it overflow the LEFT boundary, we must shrink the width
        if (left < minLeft) {
            left = minLeft;
            popoverWidth = Math.max(280, maxRight - minLeft); // Minimum width 280px
        }
    }

    const style: React.CSSProperties = {
        position: 'fixed',
        bottom: anchorRect ? (window.innerHeight - anchorRect.top + 10) : '20%',
        left: left,
        width: popoverWidth,
        zIndex: 1000,
    };

    return (
        <div
            ref={popoverRef}
            style={{ ...style, backgroundColor: '#000000', opacity: 1 }}
            className="border border-themed-medium rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
            {/* Header */}
            <div className="px-3 py-2 border-b border-themed-subtle flex items-center bg-[#111]">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getQualityColor(quality)} shadow-[0_0_8px_currentColor]`} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-themed-primary">Signal Path</span>
                </div>
            </div>

            {/* Content */}
            <div className="px-3 py-3 flex flex-col items-center max-h-[60vh] overflow-y-auto custom-scrollbar">
                {nodes.length === 0 ? (
                    <div className="py-4 text-center text-white">
                        <Asterisk className="mx-auto text-accent-primary animate-pulse mb-1" size={20} />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Identifying Path...</p>
                    </div>
                ) : nodes.map((node, index) => (
                    <React.Fragment key={index}>
                        <div className="w-full flex items-center gap-2 group">
                            <div className="p-1 bg-themed-deep rounded border border-themed-medium group-hover:border-accent-primary/30 transition-colors">
                                {getNodeIcon(node.type, node.description)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-[10px] font-bold text-themed-primary leading-none">{node.description}</h4>
                                {node.details && (
                                    <p className="text-[8px] text-themed-muted font-medium leading-tight">{node.details}</p>
                                )}
                            </div>
                            {node.status && (
                                <span className={`text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${node.status === 'enhanced'
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-purple-500/20 text-purple-400'
                                    }`}>
                                    {node.status === 'enhanced' ? 'Enhanced' : 'Lossless'}
                                </span>
                            )}
                        </div>

                        {index < nodes.length - 1 && (
                            <div className="py-0.5 flex justify-center w-full pl-3">
                                <div className="w-px h-2 bg-themed-medium/50" />
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Footer */}
            <div className="px-3 py-1.5 bg-themed-deep border-t border-themed-subtle text-center">
                <span className="text-[8px] text-themed-muted font-black uppercase tracking-[0.2em]">Bypassing OS Mixer</span>
            </div>
        </div>
    );
};

export default SignalPathPopover;
