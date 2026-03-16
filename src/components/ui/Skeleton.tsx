import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-muted rounded-md ${className}`} {...props} />
  );
}

export function ThesisCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col h-full min-h-[260px]">
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="w-10 h-10 rounded-lg" />
      </div>
      <Skeleton className="h-5 w-3/4 mb-4" />
      <Skeleton className="h-4 w-24 rounded-md mb-6" />
      
      <div className="mt-auto">
        <Skeleton className="h-3 w-1/3 mb-4" />
        <Skeleton className="h-2 w-full rounded-full mb-5" />
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-10 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function DashboardStatSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <Skeleton className="w-10 h-10 rounded-lg mb-4" />
      <Skeleton className="h-8 w-20 mb-2" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

export function WorkspaceSectionSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-48 mb-2" />
      <Skeleton className="h-3 w-24 mb-8" />
      {[100, 80, 95, 70, 85, 60, 90, 75].map((w, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}
