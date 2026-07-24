from django.db import migrations


def enable_food_capabilities(apps, schema_editor):
    VendorType = apps.get_model("accounts", "VendorType")
    VendorType.objects.filter(name="food").update(
        supports_menu_ordering=True, supports_batched_delivery=True,
    )


def disable_food_capabilities(apps, schema_editor):
    VendorType = apps.get_model("accounts", "VendorType")
    VendorType.objects.filter(name="food").update(
        supports_menu_ordering=False, supports_batched_delivery=False,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0027_vendortype_supports_batched_delivery_and_more"),
    ]

    operations = [
        migrations.RunPython(enable_food_capabilities, disable_food_capabilities),
    ]
