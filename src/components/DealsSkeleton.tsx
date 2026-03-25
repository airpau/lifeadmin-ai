import React from 'react';

const DealsSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3].map((index) => (
        <div
          key={index}
          className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse"
        >
          {/* Company logo placeholder */}
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-gray-200 rounded-lg mr-3"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded mb-2 w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>

          {/* Deal content placeholder */}
          <div className="space-y-3 mb-4">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>

          {/* Savings badge placeholder */}
          <div className="flex items-center justify-between mb-4">
            <div className="h-6 bg-gray-200 rounded-full w-20"></div>
            <div className="h-5 bg-gray-200 rounded w-16"></div>
          </div>

          {/* Button placeholder */}
          <div className="h-10 bg-gray-200 rounded w-full"></div>
        </div>
      ))}
    </div>
  );
};

export default DealsSkeleton;