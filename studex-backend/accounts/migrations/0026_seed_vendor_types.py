from django.db import migrations

VENDOR_TYPES = [
    ("food", "Food", "pickup_verification"),
    ("beauty", "Beauty", "buyer_confirmation"),
    ("laundry", "Laundry", "buyer_confirmation"),
    ("retail", "Retail", "buyer_confirmation"),
]


def seed_vendor_types(apps, schema_editor):
    VendorType = apps.get_model("accounts", "VendorType")
    for name, display_name, settlement_trigger in VENDOR_TYPES:
        VendorType.objects.get_or_create(
            name=name, defaults={"display_name": display_name, "settlement_trigger": settlement_trigger},
        )


def remove_vendor_types(apps, schema_editor):
    VendorType = apps.get_model("accounts", "VendorType")
    names = [name for name, _, _ in VENDOR_TYPES]
    VendorType.objects.filter(name__in=names).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0025_vendortype_vendor_vendor_type"),
    ]

    operations = [
        migrations.RunPython(seed_vendor_types, remove_vendor_types),
    ]
