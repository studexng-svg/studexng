export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FFF8F0] dark:bg-gray-950 p-8 max-w-2xl mx-auto pb-28">
      <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-6">Terms & Conditions</h1>
      <div className="space-y-4 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
        <p>By using StudEx, you agree to the following terms. Please read them carefully.</p>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">1. Platform Use</h2>
        <p>StudEx is a marketplace exclusively for Pan-Atlantic University students and vendors. You must be a registered member of the PAU community to use this platform.</p>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">2. Payments</h2>
        <p>All transactions are processed securely via Paystack. StudEx collects a platform fee on each transaction. Payments are held in escrow and released to vendors after service completion.</p>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">3. Vendor Responsibilities</h2>
        <p>Vendors are fully responsible for fulfilling their orders and services as described. Misleading listings or failure to deliver may result in account suspension.</p>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">4. Refunds</h2>
        <p>Refunds are processed back to your original payment method. Contact support within 24 hours of a failed delivery to request a refund.</p>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">5. Contact</h2>
        <p>For support, contact us at studex.biz@pau.edu.ng</p>
      </div>
    </div>
  );
}
