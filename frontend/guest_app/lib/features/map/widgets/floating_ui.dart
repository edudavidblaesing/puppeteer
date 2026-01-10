import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

class FloatingMapUI extends StatelessWidget {
  final VoidCallback onMenuTap;
  final VoidCallback onSearchTap;
  final VoidCallback onAvatarTap;
  final VoidCallback onNewMomentTap;
  final String? selectedTimeFilter;
  final ValueChanged<String?> onTimeFilterChanged;

  const FloatingMapUI({
    super.key,
    required this.onMenuTap,
    required this.onSearchTap,
    required this.onAvatarTap,
    required this.onNewMomentTap,
    required this.selectedTimeFilter,
    required this.onTimeFilterChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // Top Floating Bar
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: Container(
            padding:
                const EdgeInsets.only(top: 60, left: 20, right: 20, bottom: 20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  Colors.black.withOpacity(0.6),
                  Colors.transparent,
                ],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: Row(
              children: [
                _GlassIconButton(icon: Icons.menu, onTap: onMenuTap),
                const Spacer(),
                // Time Filter Dropdown (Centered)
                _GlassDropdown(
                    value: selectedTimeFilter,
                    items: const [
                      DropdownMenuItem(value: null, child: Text("All Time")),
                      DropdownMenuItem(value: 'today', child: Text("Today")),
                      DropdownMenuItem(
                          value: 'tomorrow', child: Text("Tomorrow")),
                      DropdownMenuItem(
                          value: 'this_week', child: Text("This Week")),
                    ],
                    onChanged: onTimeFilterChanged),
                const Spacer(),
                _GlassIconButton(icon: Icons.search, onTap: onSearchTap),
                const SizedBox(width: 12),
                GestureDetector(
                  onTap: onAvatarTap,
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: const CircleAvatar(
                      radius: 18,
                      backgroundImage:
                          NetworkImage('https://i.pravatar.cc/150?u=me'),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),

        // Bottom CTAs
        Positioned(
          bottom: 40,
          left: 0,
          right: 0,
          child: Center(
            child: GestureDetector(
              onTap: onNewMomentTap,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF6B42F5), Color(0xFF8E6AF7)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(32),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF6B42F5).withOpacity(0.4),
                      blurRadius: 16,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.add, color: Colors.white, size: 24),
                    SizedBox(width: 8),
                    Text(
                      "New Moment",
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              )
                  .animate(
                      onPlay: (c) =>
                          c.repeat(reverse: true)) // Breathing effect
                  .scaleXY(
                      begin: 1.0,
                      end: 1.05,
                      duration: 2000.ms,
                      curve: Curves.easeInOut),
            ),
          ),
        ),
      ],
    );
  }
}

class _GlassIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _GlassIconButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.1),
          shape: BoxShape.circle,
          // backdrop filter would require ClipRect and BackdropFilter
          border: Border.all(color: Colors.white.withOpacity(0.2)),
        ),
        child: Icon(icon, color: Colors.white, size: 24),
      ),
    );
  }
}

class _GlassDropdown extends StatelessWidget {
  final String? value;
  final List<DropdownMenuItem<String?>> items;
  final ValueChanged<String?> onChanged;

  const _GlassDropdown({
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black54,
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: Colors.white24),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String?>(
          value: value,
          items: items,
          onChanged: onChanged,
          dropdownColor: Colors.grey[900],
          style: const TextStyle(
              color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
          icon: const Icon(Icons.keyboard_arrow_down, color: Colors.white70),
          isDense: true,
          alignment: Alignment.center,
        ),
      ),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: -0.5);
  }
}
