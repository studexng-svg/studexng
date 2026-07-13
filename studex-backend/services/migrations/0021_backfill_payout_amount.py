from decimal import Decimal
from django.db import migrations

# Frozen copy of payments.pricing's formula as of this migration — data migrations
# must not depend on current app code, which can change or be removed later. Any
# future change to the live fee formula does NOT change what this one-time backfill
# computed historically.
MIN_FEE = Decimal("100")
MAX_FEE = Decimal("3500")


def _calculate_final_price(payout_amount, fee_percent):
    rate = fee_percent / Decimal("100")
    fee = (payout_amount * rate).quantize(Decimal("0.01"))
    fee = max(MIN_FEE, min(fee, MAX_FEE))
    return payout_amount + fee


def backfill_payout_amounts(apps, schema_editor):
    Listing = apps.get_model('services', 'Listing')
    PricingSettings = apps.get_model('payments', 'PricingSettings')

    settings_row, _ = PricingSettings.objects.get_or_create(pk=1, defaults={'service_fee_percent': Decimal('8.00')})
    fee_percent = settings_row.service_fee_percent

    # Idempotent: only touches rows that have never been backfilled. Re-running this
    # migration (or a fresh `migrate` from zero) is always safe.
    listings = list(Listing.objects.filter(payout_amount__isnull=True))
    for listing in listings:
        payout_amount = listing.price  # under the old model, price never included a fee
        listing.payout_amount = payout_amount
        listing.price = _calculate_final_price(payout_amount, fee_percent)
    Listing.objects.bulk_update(listings, ['payout_amount', 'price'], batch_size=500)


def noop_reverse(apps, schema_editor):
    # Deliberately not reversible — reversing would need to know each listing's
    # pre-backfill price, which we no longer have once forward-migrated. Leaving
    # payout_amount/price as-is on reverse is safer than guessing.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0020_listing_payout_amount'),
        ('payments', '0013_pricingsettings'),
    ]

    operations = [
        migrations.RunPython(backfill_payout_amounts, noop_reverse),
    ]
