from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


def compute_addon_signature(addon_ids):
    """
    Deterministic, order-independent signature for a set of selected Addon
    ids (Phase 1 — Food Commerce Engine). Choosing the same add-ons in a
    different order still resolves to the same signature, so it correctly
    merges into one cart line rather than creating a duplicate.

    An empty selection — every add-to-cart call for a non-menu listing, and
    a menu item ordered with no customization — always produces '', which is
    exactly the value every pre-existing CartItem row now has (see the
    AddField default below). That's what makes the widened uniqueness
    constraint on CartItem a strict superset of the old one: for any
    listing that never has add-ons selected, "(user, listing, '')" behaves
    identically to the old "(user, listing)", because '' is the only
    signature that can ever occur for it.
    """
    if not addon_ids:
        return ''
    return ','.join(str(i) for i in sorted({int(a) for a in addon_ids}))


class CartItem(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cart_items')
    listing = models.ForeignKey('services.Listing', on_delete=models.CASCADE, related_name='cart_items')
    quantity = models.PositiveIntegerField(default=1)
    # Phase 1 — Food Commerce Engine. Stored (not computed on the fly) so it
    # can participate in a DB-level uniqueness constraint — the same
    # "enforce it in the database, not just in application code" principle
    # already used for DeliveryVerificationEvent's uniqueness in Blocker 4.
    # Always '' for a plain listing or an unmodified menu item — see
    # compute_addon_signature's docstring for why that preserves the
    # original (user, listing) constraint's behavior exactly.
    addon_signature = models.CharField(max_length=255, blank=True, default='')
    reserved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Widened from ('user', 'listing') — a strict superset for any row
        # with the default '' signature, so every existing row and every
        # non-menu add-to-cart call keeps exactly the same dedup behavior it
        # always had. Only diverges (permits a second row for one listing)
        # when two different, non-empty add-on selections are stored.
        unique_together = ('user', 'listing', 'addon_signature')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} — {self.listing.title} ×{self.quantity}"


class CartItemAddon(models.Model):
    """
    A buyer's pre-checkout add-on selection on a cart item (Phase 1 — Food
    Commerce Engine). Normalized rather than a JSON blob — a cart is
    short-lived and gets fully re-validated at checkout regardless (price,
    availability, and add-on prices are never trusted from the cart), so
    there's no historical-accuracy need driving the JSON-vs-row choice the
    way there is for a placed order's OrderItemAddon.
    """
    cart_item = models.ForeignKey(CartItem, on_delete=models.CASCADE, related_name='selected_addons')
    addon = models.ForeignKey('services.Addon', on_delete=models.CASCADE, related_name='cart_selections')
    price_delta_at_add_time = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        verbose_name = "Cart Item Add-on"
        verbose_name_plural = "Cart Item Add-ons"

    def __str__(self):
        return f"{self.cart_item} — {self.addon.name}"
