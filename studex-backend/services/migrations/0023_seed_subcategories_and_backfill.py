from django.db import migrations
from django.utils.text import slugify

# The 3 named categories and their full subcategory lists, per product spec.
# Category titles are matched case-insensitively against whatever already exists in
# the real DB (production Postgres already has these — this migration must not
# assume it's creating them from scratch, only that it should reuse them if found).
NAMED_CATEGORY_SUBCATEGORIES = {
    "Beauty & Makeup": [
        "Makeup Artist", "Makeup Kits", "Hair Stylist", "Hair Braiding",
        "Nail Technician", "Lash Technician", "Brow Technician",
        "Wig Installation", "Barbing", "Hair Products",
    ],
    "Hygiene & Self-Care": [
        "Perfumes", "Skincare", "Face Care", "Body Care",
        "Toiletries", "Oral Care", "Hair Care", "Personal Hygiene",
    ],
    "Laundry Services": [
        "Washing Only", "Ironing Only", "Washing & Ironing",
        "Dry Cleaning", "Shoe Cleaning", "Bag Cleaning",
    ],
}

# Ordered (most specific first) keyword -> subcategory title, scoped per named
# category. Best-effort matching against a listing's title+description, lowercased.
# Not a generic NLP guesser — a listing that matches nothing falls back to
# "Uncategorized", per spec.
KEYWORD_MATCHES = {
    "Beauty & Makeup": [
        ("makeup kit", "Makeup Kits"), ("makeup set", "Makeup Kits"),
        ("makeup artist", "Makeup Artist"), ("mua", "Makeup Artist"),
        ("hair braid", "Hair Braiding"), ("braiding", "Hair Braiding"), ("braid", "Hair Braiding"),
        ("hairstylist", "Hair Stylist"), ("hair stylist", "Hair Stylist"), ("hairstyle", "Hair Stylist"),
        ("nail", "Nail Technician"),
        ("lash", "Lash Technician"),
        ("eyebrow", "Brow Technician"), ("brow", "Brow Technician"),
        ("wig", "Wig Installation"),
        ("barber", "Barbing"), ("barbing", "Barbing"), ("haircut", "Barbing"), ("shave", "Barbing"),
        ("hair product", "Hair Products"),
        ("makeup", "Makeup Artist"),
    ],
    "Hygiene & Self-Care": [
        ("perfume", "Perfumes"), ("cologne", "Perfumes"), ("fragrance", "Perfumes"),
        ("face wash", "Face Care"), ("facial", "Face Care"), ("face cream", "Face Care"), ("face care", "Face Care"),
        ("body lotion", "Body Care"), ("body wash", "Body Care"), ("body care", "Body Care"),
        ("skincare", "Skincare"), ("skin care", "Skincare"),
        ("toothpaste", "Oral Care"), ("mouthwash", "Oral Care"), ("oral care", "Oral Care"), ("dental", "Oral Care"),
        ("shampoo", "Hair Care"), ("conditioner", "Hair Care"), ("hair care", "Hair Care"),
        ("sanitary", "Personal Hygiene"), ("deodorant", "Personal Hygiene"), ("hygiene", "Personal Hygiene"),
        ("toiletries", "Toiletries"), ("soap", "Toiletries"), ("tissue", "Toiletries"),
    ],
    "Laundry Services": [
        ("dry clean", "Dry Cleaning"),
        ("wash and iron", "Washing & Ironing"), ("washing and ironing", "Washing & Ironing"), ("wash & iron", "Washing & Ironing"),
        ("shoe clean", "Shoe Cleaning"), ("sneaker clean", "Shoe Cleaning"),
        ("bag clean", "Bag Cleaning"),
        ("iron only", "Ironing Only"), ("ironing only", "Ironing Only"), ("iron", "Ironing Only"),
        ("wash only", "Washing Only"), ("washing only", "Washing Only"), ("wash", "Washing Only"),
    ],
}

UNCATEGORIZED_SLUG = "uncategorized"
UNCATEGORIZED_TITLE = "Uncategorized"


def seed_and_backfill(apps, schema_editor):
    Category = apps.get_model('services', 'Category')
    Subcategory = apps.get_model('services', 'Subcategory')
    Listing = apps.get_model('services', 'Listing')

    # 1. Named categories + their full subcategory lists (idempotent).
    named_category_ids = set()
    for cat_title, sub_titles in NAMED_CATEGORY_SUBCATEGORIES.items():
        category = Category.objects.filter(title__iexact=cat_title).first()
        if category is None:
            # These are the platform's 3 core categories — visible on every campus,
            # not campus-restricted like a vendor-specific one might be.
            category = Category.objects.create(
                title=cat_title, slug=slugify(cat_title), is_pau=True, is_futo=True, is_imsu=True,
            )
        elif not (category.is_pau and category.is_futo and category.is_imsu):
            # Reusing a pre-existing category by that name — still force it visible
            # on every campus, since these 3 are core categories regardless of
            # whatever campus flags it happened to have before this migration.
            category.is_pau = True
            category.is_futo = True
            category.is_imsu = True
            category.save(update_fields=['is_pau', 'is_futo', 'is_imsu'])
        named_category_ids.add(category.id)
        for sub_title in sub_titles:
            Subcategory.objects.get_or_create(
                category=category, slug=slugify(sub_title), defaults={'title': sub_title},
            )

    # 2. Every other existing category gets one generic "Uncategorized" subcategory,
    # if it doesn't already have any subcategories.
    for category in Category.objects.exclude(id__in=named_category_ids):
        if not Subcategory.objects.filter(category=category).exists():
            Subcategory.objects.get_or_create(
                category=category, slug=UNCATEGORIZED_SLUG, defaults={'title': UNCATEGORIZED_TITLE},
            )

    # 3. Backfill every listing that has no subcategory yet.
    for listing in Listing.objects.filter(subcategory__isnull=True).select_related('category'):
        haystack = f"{listing.title} {listing.description}".lower()
        matched = None
        for cat_title, keyword_pairs in KEYWORD_MATCHES.items():
            if listing.category.title.lower() != cat_title.lower():
                continue
            for keyword, sub_title in keyword_pairs:
                if keyword in haystack:
                    matched = Subcategory.objects.filter(category=listing.category, title=sub_title).first()
                    break
            break
        if matched is None:
            matched, _ = Subcategory.objects.get_or_create(
                category=listing.category, slug=UNCATEGORIZED_SLUG, defaults={'title': UNCATEGORIZED_TITLE},
            )
        listing.subcategory = matched
        listing.save(update_fields=['subcategory'])


def noop_reverse(apps, schema_editor):
    # Not reversible — see 0021_backfill_payout_amount.py for the same rationale.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0022_subcategory_listing_subcategory_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_and_backfill, noop_reverse),
    ]
