from django.db import migrations

CATEGORIES = [
    ("Food & Drinks", "food-drinks"),
    ("Hair & Beauty", "hair-beauty"),
    ("Laundry", "laundry"),
    ("Tutoring", "tutoring"),
    ("Fashion & Clothing", "fashion-clothing"),
    ("Tech & Repair", "tech-repair"),
    ("Photography", "photography"),
    ("Books & Stationery", "books-stationery"),
    ("Health & Wellness", "health-wellness"),
    ("Other Services", "other-services"),
]


def seed_categories(apps, schema_editor):
    Category = apps.get_model("services", "Category")
    for title, slug in CATEGORIES:
        Category.objects.get_or_create(slug=slug, defaults={"title": title})


def remove_categories(apps, schema_editor):
    Category = apps.get_model("services", "Category")
    slugs = [slug for _, slug in CATEGORIES]
    Category.objects.filter(slug__in=slugs).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("services", "0007_alter_category_image_alter_listing_image"),
    ]

    operations = [
        migrations.RunPython(seed_categories, remove_categories),
    ]
