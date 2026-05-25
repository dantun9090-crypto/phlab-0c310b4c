import { useState } from 'react';
import { Database, Upload, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCw, Tag } from 'lucide-react';
import { seedProducts, checkSeedStatus, clearAllProducts, migrateAddSlugs, migrateMerchantSEO } from '@/lib/seedProducts';

export default function DatabaseTab() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [clearing, setClearing] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<any>(null);
  const [seoMigrating, setSeoMigrating] = useState(false);
  const [seoMigrateResult, setSeoMigrateResult] = useState<any>(null);

  const handleCheckStatus = async () => {
    setLoading(true);
    try {
      const s = await checkSeedStatus();
      setStatus(s);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    if (!confirm('This will add 15 products to Firestore. Continue?')) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      const res = await seedProducts();
      setResult(res);
      
      // Refresh status
      const s = await checkSeedStatus();
      setStatus(s);
    } catch (error) {
      setResult({ success: false, message: 'Failed to seed', error });
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('⚠️ WARNING: This will DELETE ALL PRODUCTS from Firestore. This cannot be undone. Continue?')) return;
    
    setClearing(true);
    try {
      const res = await clearAllProducts();
      setResult({ success: res.success, message: res.success ? `Deleted ${res.deleted} products from product_stock` : 'Failed to clear products' });
      setStatus({ exists: false, count: 0, products: [] });
    } catch (error) {
      console.error(error);
      setResult({ success: false, message: 'Failed to clear products' });
    } finally {
      setClearing(false);
    }
  };

  const handleMigrateSlugs = async () => {
    if (!confirm('This will add a "slug" field to any Firestore products that are missing it. Safe to run multiple times. Continue?')) return;
    setMigrating(true);
    setMigrateResult(null);
    try {
      const res = await migrateAddSlugs();
      setMigrateResult(res);
    } catch (error: any) {
      setMigrateResult({ success: false, message: error.message || 'Migration failed' });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Database Management</h2>
        <p className="text-[#6b8fba]">Seed Firestore with initial product catalog or manage existing data</p>
      </div>

      {/* Status Card */}
      <div className="bg-[#0b1a30]/60 border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Database Status</h3>
              <p className="text-sm text-[#6b8fba]">Current Firestore product count</p>
            </div>
          </div>
          <button
            onClick={handleCheckStatus}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-[#0f2640] hover:bg-[#1a3a5c] text-white rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Check Status
          </button>
        </div>

        {status && (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-[#04101f]/50 rounded-lg">
              <span className="text-[#6b8fba] text-sm">Products in database:</span>
              <span className="text-white font-bold text-lg">{status.count}</span>
            </div>
            {status.count > 0 && (
              <div className="p-3 bg-[#04101f]/50 rounded-lg">
                <p className="text-xs text-[#2a4a7a] mb-2">Products:</p>
                <div className="flex flex-wrap gap-2">
                  {status.products.map((p: any, i: number) => (
                    <span key={i} className="px-2 py-1 bg-blue-500/10 text-blue-300 text-xs rounded border border-blue-500/20">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Seed Products */}
        <div className="bg-[#0b1a30]/60 border border-white/10 rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Seed Products</h3>
              <p className="text-sm text-[#6b8fba]">Add 15 initial peptide products to Firestore</p>
            </div>
          </div>
          <ul className="text-xs text-[#2a4a7a] space-y-1 mb-4 ml-13">
            <li>• Retatrutide (10mg, 20mg)</li>
            <li>• Semaglutide (5mg, 10mg)</li>
            <li>• Tirzepatide (10mg, 30mg)</li>
            <li>• BPC-157, KPV, MOTS-c, PT-141</li>
            <li>• And 8 more products with variants</li>
          </ul>
          <button
            onClick={handleSeed}
            disabled={loading || clearing}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Seeding...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Seed Database
              </>
            )}
          </button>
        </div>

        {/* Clear All */}
        <div className="bg-[#0b1a30]/60 border border-white/10 rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-red-600/20 rounded-lg flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Clear All Products</h3>
              <p className="text-sm text-[#6b8fba]">Delete all products from Firestore</p>
            </div>
          </div>
          <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg mb-4">
            <p className="text-xs text-red-400">⚠️ Warning: This action cannot be undone. All product data will be permanently deleted.</p>
          </div>
          <button
            onClick={handleClearAll}
            disabled={loading || clearing || !status?.count}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {clearing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Clearing...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Clear All Products
              </>
            )}
          </button>
        </div>
      </div>

      {/* Slug Migration */}
      <div className="bg-[#0b1a30]/60 border border-purple-500/20 rounded-xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center shrink-0">
            <Tag className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white mb-1">Migrate Product Slugs</h3>
            <p className="text-sm text-[#6b8fba]">
              Adds SEO-friendly URL slugs to existing Firestore products. Safe to run multiple times — only updates products missing a slug.
            </p>
          </div>
        </div>
        <div className="p-3 bg-purple-900/20 border border-purple-500/20 rounded-lg mb-4">
          <p className="text-xs text-purple-300">
            Required for clean product URLs (e.g. <span className="font-mono">/products/retatrutide</span> instead of a random ID). Run this once after first deploy or after seeding.
          </p>
        </div>
        <button
          onClick={handleMigrateSlugs}
          disabled={migrating || loading || clearing}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {migrating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Migrating slugs...
            </>
          ) : (
            <>
              <Tag className="w-4 h-4" />
              Run Slug Migration
            </>
          )}
        </button>

        {migrateResult && (
          <div className={`mt-4 p-3 rounded-lg border ${
            migrateResult.success
              ? 'bg-green-900/20 border-green-500/30'
              : 'bg-red-900/20 border-red-500/30'
          }`}>
            <div className="flex items-start gap-2">
              {migrateResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${migrateResult.success ? 'text-green-300' : 'text-red-300'}`}>
                  {migrateResult.message}
                </p>
                {migrateResult.updated !== undefined && (
                  <p className="text-xs text-[#6b8fba] mt-1">
                    {migrateResult.updated} updated · {migrateResult.skipped} already had slugs
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className={`p-4 rounded-xl border ${
          result.success 
            ? 'bg-green-900/20 border-green-500/30' 
            : 'bg-red-900/20 border-red-500/30'
        }`}>
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`font-medium ${result.success ? 'text-green-300' : 'text-red-300'}`}>
                {result.message}
              </p>
              {result.count !== undefined && (
                <p className="text-sm text-[#6b8fba] mt-1">
                  {result.count} of {result.total} products added successfully
                </p>
              )}
              {result.error && (
                <p className="text-xs text-red-400 mt-2 font-mono">
                  {String(result.error)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-300">
            <p className="font-medium mb-2">How it works:</p>
            <ol className="space-y-1 text-blue-400/80">
              <li>1. Click "Check Status" to see current products</li>
              <li>2. Click "Seed Database" to add 15 products with variants</li>
              <li>3. The script will skip products that already exist</li>
              <li>4. After seeding, refresh your Products page to see them</li>
              <li>5. Use "Clear All" only if you want to start fresh</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
