import { useState, useEffect } from 'react';
import { Crown, Lock, ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, subscribeToProducts, doc, getDoc, onAuthStateChanged } from '@/lib/firebase';

import { ProductCard } from '@/components/ProductCard';
import type { Product } from '@/lib/firebase';
import { dispatchAddToCart } from '@/components/Layout';

export default function VipStore() {
  const [authLoading, setAuthLoading] = useState(true);
  const [isVip, setIsVip] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [userEmail, setUserEmail] = useState('');

  // Set page meta
  useEffect(() => {
    document.title = 'VIP Members Store | Pro Health Peptides';
  }, []);

  // Auth + VIP check
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setAuthLoading(false); return; }
      setUserEmail(user.email || '');
      try {
        const snap = await getDoc(doc(db, 'customers', user.uid));
        if (snap.exists() && snap.data()?.isVip === true) {
          setIsVip(true);
        }
      } catch {
        // permissions error — not VIP
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Load VIP products (tagged isVip: true)
  useEffect(() => {
    if (!isVip) return;
    const unsub = subscribeToProducts((all) => {
      const vipProducts = all.filter(p => (p as any).isVip === true && p.isActive !== false);
      setProducts(vipProducts);
      setSelectedVariants(prev => {
        const d = { ...prev };
        vipProducts.forEach(p => {
          if (!d[p.id]) d[p.id] = p.variants?.[0]?.id ?? '';
        });
        return d;
      });
    });
    return () => unsub();
  }, [isVip]);

  const handleAddToCart = (product: Product) => {
    const variantId = selectedVariants[product.id] || product.variants?.[0]?.id || '';
    const variant = product.variants?.find(v => v.id === variantId);
    if (!variant) return;
    const priceNum = variant.price ?? product.price;
    dispatchAddToCart({
      id: product.id,
      variantId: variant.id,
      name: product.name,
      variantName: variant.name,
      dosage: variant.name,
      price: `£${priceNum.toFixed(2)}`,
      priceNum,
      quantity: 1,
      image: product.imageUrl || product.images?.[0] || '',
      stock: variant.stock,
    });
    const key = `${product.id}-${variantId}`;
    setAddedIds(prev => new Set([...prev, key]));
    setTimeout(() => setAddedIds(prev => { const n = new Set(prev); n.delete(key); return n; }), 2000);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  // Not logged in
  if (!userEmail) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Lock className="w-9 h-9 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Members Only</h1>
          <p className="text-[#9cb8d9] mb-8">Please log in to access the VIP store.</p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-400 text-gray-900 font-bold px-8 py-3.5 rounded-xl hover:from-amber-400 hover:to-amber-300 transition-all"
          >
            Log In <ArrowRight className="w-4 h-4" />
          </a>
        </motion.div>
      </div>
    );
  }

  // Logged in but not VIP
  if (!isVip) {
    return (
      <div className="min-h-screen bg-[#060f1e] flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Crown className="w-9 h-9 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">VIP Access Required</h1>
          <p className="text-[#9cb8d9] mb-2">This exclusive store is available to VIP members only.</p>
          <p className="text-[#4a6a9a] text-sm mb-8">Contact us to request VIP membership or speak to your account manager.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/contact"
              className="inline-flex items-center justify-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 font-semibold px-6 py-3 rounded-xl hover:bg-amber-500/20 transition-all"
            >
              Request VIP Access
            </a>
            <a
              href="/products"
              className="inline-flex items-center justify-center gap-2 bg-[#0b1a30] border border-white/10 text-[#8caad4] font-medium px-6 py-3 rounded-xl hover:bg-[#0f2244] transition-all"
            >
              Browse Store
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  // VIP Access granted
  return (
    <div className="min-h-screen bg-[#060f1e]">
      {/* VIP Header */}
      <div className="relative pt-24 pb-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/20 via-[#060f1e] to-[#060f1e]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-amber-500/5 rounded-full" />
        <div className="container mx-auto px-6 relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-1.5 rounded-full text-sm font-semibold mb-6"
          >
            <Crown className="w-4 h-4" />
            VIP Members Store
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-3xl md:text-4xl font-bold text-white mb-3"
          >
            Exclusive Research Compounds
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-[#9cb8d9] max-w-xl mx-auto"
          >
            Premium compounds and limited batches available exclusively to verified VIP researchers.
          </motion.p>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-4 inline-flex items-center gap-2 text-green-400 text-sm"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Access granted — welcome back</span>
          </motion.div>
        </div>
      </div>

      {/* Products */}
      <div className="container mx-auto px-6 pb-20">
        {products.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <Crown className="w-14 h-14 text-amber-500/30 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Coming Soon</h2>
            <p className="text-[#9cb8d9] max-w-sm mx-auto">
              VIP exclusive products are being prepared. Check back soon for premium compounds available only to members.
            </p>
          </motion.div>
        ) : (
          <AnimatePresence>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product, index) => {
                const selectedVariantId = selectedVariants[product.id] || product.variants?.[0]?.id || '';
                const cartKey = `${product.id}-${selectedVariantId}`;
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    index={index}
                    selectedVariantId={selectedVariantId}
                    isAdded={addedIds.has(cartKey)}
                    onVariantSelect={(_, vid: string) => setSelectedVariants(prev => ({ ...prev, [product.id]: vid }))}
                    onAddToCart={handleAddToCart}
                  />
                );
              })}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
