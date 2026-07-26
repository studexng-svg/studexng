from django.db import migrations

# (name, catalog_label, catalog_item_label, catalog_route_slug)
# Food preserves its exact existing behavior: "Menu" / "Dish" / the literal
# "kitchen" route that already ships. The others get sensible defaults for
# a future type that opts into supports_menu_ordering; none of them use
# these fields yet since only Food has that flag set today.
CATALOG_LABELS = [
    ("food", "Menu", "Dish", "kitchen"),
    ("beauty", "Services", "Service", "services"),
    ("laundry", "Services", "Service", "services"),
    ("retail", "Catalog", "Item", "catalog"),
]


def seed_catalog_labels(apps, schema_editor):
    VendorType = apps.get_model("accounts", "VendorType")
    for name, catalog_label, catalog_item_label, catalog_route_slug in CATALOG_LABELS:
        VendorType.objects.filter(name=name).update(
            catalog_label=catalog_label,
            catalog_item_label=catalog_item_label,
            catalog_route_slug=catalog_route_slug,
        )


def revert_catalog_labels(apps, schema_editor):
    VendorType = apps.get_model("accounts", "VendorType")
    names = [name for name, _, _, _ in CATALOG_LABELS]
    VendorType.objects.filter(name__in=names).update(
        catalog_label="Menu", catalog_item_label="Item", catalog_route_slug="catalog",
    )


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0029_vendortype_catalog_labels"),
    ]

    operations = [
        migrations.RunPython(seed_catalog_labels, revert_catalog_labels),
    ]
