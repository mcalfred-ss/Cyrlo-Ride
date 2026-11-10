/// List snapshot with a first-load flag for skeleton UIs.
class LoadableList<T> {
  const LoadableList({
    this.items = const [],
    this.isLoading = false,
  });

  final List<T> items;
  final bool isLoading;

  bool get isEmpty => items.isEmpty;
  bool get isNotEmpty => items.isNotEmpty;
  int get length => items.length;

  LoadableList<T> copyWith({
    List<T>? items,
    bool? isLoading,
  }) {
    return LoadableList<T>(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}
