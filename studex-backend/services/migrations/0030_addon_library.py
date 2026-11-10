# Generated manually (Phase 2 — vendor-level add-on library).
#
# Turns AddonGroup from a 1:1 child of MenuItem into a vendor-owned,
# reusable template linked to any number of MenuItems via the new
# MenuItemAddonGroup through-model. The data migration below backfills
# AddonGroup.vendor and one MenuItemAddonGroup row per existing group from
# the old menu_item FK, before that FK is dropped — every pre-existing
# group keeps exactly the one link it already had, so no vendor's menu
# changes shape when this ships.
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def backfill_vendor_and_links(apps, schema_editor):
    AddonGroup = apps.get_model('services', 'AddonGroup')
    MenuItemAddonGroup = apps.get_model('services', 'MenuItemAddonGroup')
    for group in AddonGroup.objects.select_related('menu_item__listing').all():
        group.vendor_id = group.menu_item.listing.vendor_id
        group.save(update_fields=['vendor_id'])
        MenuItemAddonGroup.objects.create(
            menu_item_id=group.menu_item_id,
            addon_group_id=group.id,
            display_order=group.display_order,
        )


def noop_reverse(apps, schema_editor):
    # Nothing to do: the AddField/CreateModel operations below are reversed
    # by Django automatically, which drops the backfilled data with them.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0029_hero_slide'),
    ]

    operations = [
        # 1. New through-model, built against the old menu_item FK's target
        #    (MenuItem) and the not-yet-repurposed AddonGroup.
        migrations.CreateModel(
            name='MenuItemAddonGroup',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('display_order', models.PositiveIntegerField(default=0)),
                ('is_required_override', models.BooleanField(blank=True, null=True)),
                ('min_selections_override', models.PositiveIntegerField(blank=True, null=True)),
                ('max_selections_override', models.PositiveIntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('addon_group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='menu_item_links', to='services.addongroup')),
                ('menu_item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='addon_group_links', to='services.menuitem')),
            ],
            options={
                'verbose_name': 'Add-on Group Link',
                'verbose_name_plural': 'Add-on Group Links',
                'ordering': ['menu_item_id', 'display_order', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='menuitemaddongroup',
            constraint=models.UniqueConstraint(fields=('menu_item', 'addon_group'), name='unique_menuitem_addongroup_link'),
        ),

        # 2. Add vendor FK to AddonGroup, nullable for now so the backfill
        #    below has something to populate before it's tightened.
        migrations.AddField(
            model_name='addongroup',
            name='vendor',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='addon_groups', to=settings.AUTH_USER_MODEL),
        ),

        # 3. Backfill vendor + one link per existing group, while the old
        #    menu_item FK is still present to read from.
        migrations.RunPython(backfill_vendor_and_links, noop_reverse),

        # 4. Drop the old 1:1 FK and tighten vendor to required, then add
        #    the M2M accessor (AddonGroup.menu_items, via the through-model
        #    above) and the new vendor-scoped ordering.
        migrations.RemoveField(
            model_name='addongroup',
            name='menu_item',
        ),
        migrations.AlterField(
            model_name='addongroup',
            name='vendor',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='addon_groups', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='addongroup',
            name='menu_items',
            field=models.ManyToManyField(blank=True, related_name='addon_groups', through='services.MenuItemAddonGroup', to='services.menuitem'),
        ),
        migrations.AlterModelOptions(
            name='addongroup',
            options={'ordering': ['vendor_id', 'display_order', 'id'], 'verbose_name': 'Add-on Group', 'verbose_name_plural': 'Add-on Groups'},
        ),
    ]
