import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/auth_controller.dart';
import '../auth/session_provider.dart';
import '../../core/widgets.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _nameController = TextEditingController();
  final _bioController = TextEditingController(); // Bio update implementation pending in backend if needed
  final _usernameController = TextEditingController();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    final user = ref.read(sessionProvider).value;
    if (user != null) {
      _nameController.text = user.fullName;
      _usernameController.text = user.username;
      _bioController.text = user.bio ?? '';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Edit Profile'),
        backgroundColor: Colors.black,
        actions: [
          TextButton(
            onPressed: _isLoading ? null : _saveProfile,
            child: const Text('Save', style: TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          children: [
            // Avatar (Placeholder for now)
            Stack(
              children: [
                CircleAvatar(
                  radius: 50,
                  backgroundImage: NetworkImage(ref.read(sessionProvider).value?.avatarUrl ?? 'https://i.pravatar.cc/300'),
                  child: const Icon(Icons.person, size: 50),
                ),
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(color: Colors.blueAccent, shape: BoxShape.circle),
                    child: const Icon(Icons.camera_alt, size: 16, color: Colors.white),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 32),
            CustomTextField(
              controller: _nameController,
              hintText: 'Full Name',
              label: 'Full Name',
              prefixIcon: Icons.person_outline,
            ),
            const SizedBox(height: 16),
            CustomTextField(
              controller: _usernameController,
              hintText: 'Username',
              label: 'Username',
              prefixIcon: Icons.alternate_email,
            ),
            const SizedBox(height: 16),
             CustomTextField(
              controller: _bioController,
              hintText: 'Bio',
              label: 'Bio',
              prefixIcon: Icons.edit_note,
              maxLines: 3,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _saveProfile() async {
    setState(() => _isLoading = true);
    
    // Call AuthController.updateProfile
    // We need to add updateProfile to AuthController first, but for now let's just simulate or add basic support
    final success = await ref.read(authControllerProvider.notifier).updateProfile(
      fullName: _nameController.text,
      username: _usernameController.text,
      bio: _bioController.text,
    );
     
    if (mounted) {
      setState(() => _isLoading = false);
      if (success) {
        context.pop();
        ref.read(sessionProvider.notifier).restoreSession(); // Refresh data
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to update profile')));
      }
    }
  }
}
