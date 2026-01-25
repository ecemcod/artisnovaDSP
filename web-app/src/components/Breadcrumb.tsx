import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { useNavigation } from './NavigationProvider';

interface BreadcrumbProps {
  className?: string;
  maxItems?: number;
  showHome?: boolean;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ 
  className = '', 
  maxItems = 5,
  showHome = true 
}) => {
  const { getBreadcrumbs, navigate } = useNavigation();
  const breadcrumbs = getBreadcrumbs();

  if (breadcrumbs.length === 0) return null;

  // Limit breadcrumbs if too many
  const displayBreadcrumbs = breadcrumbs.length > maxItems 
    ? [breadcrumbs[0], { view: '...', title: '...', url: '', timestamp: 0 }, ...breadcrumbs.slice(-maxItems + 2)]
    : breadcrumbs;

  const handleBreadcrumbClick = (entry: any) => {
    if (entry.view === '...') return;
    
    if (entry.view === 'home') {
      navigate('home');
    } else {
      navigate(entry.view, entry.id);
    }
  };

  return (
    <nav className={`flex items-center space-x-1 text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-1">
        {displayBreadcrumbs.map((entry, index) => (
          <li key={`${entry.view}-${entry.id || 'root'}-${index}`} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-gray-400 mx-1" />
            )}
            
            {entry.view === '...' ? (
              <span className="text-gray-400 px-2">...</span>
            ) : (
              <button
                onClick={() => handleBreadcrumbClick(entry)}
                className={`flex items-center px-2 py-1 rounded hover:bg-gray-100 transition-colors ${
                  index === displayBreadcrumbs.length - 1 
                    ? 'text-gray-900 font-medium cursor-default' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                disabled={index === displayBreadcrumbs.length - 1}
              >
                {entry.view === 'home' && showHome && (
                  <Home className="w-4 h-4 mr-1" />
                )}
                <span className="truncate max-w-32">{entry.title}</span>
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

// Breadcrumb styling variants
export const BreadcrumbCompact: React.FC<BreadcrumbProps> = (props) => (
  <Breadcrumb 
    {...props} 
    className={`text-xs ${props.className || ''}`}
    maxItems={3}
    showHome={false}
  />
);

export const BreadcrumbMobile: React.FC<BreadcrumbProps> = (props) => {
  return (
    <Breadcrumb 
      {...props}
      className={`md:hidden ${props.className || ''}`}
    />
  );
};