"""
OEE Calculator - Process-agnostic OEE calculation engine
Calculates Availability, Performance, Quality, and Overall OEE
"""

class OEECalculator:
    """Core OEE calculation logic that works for any manufacturing process"""
    
    @staticmethod
    def calculate_availability(planned_time, downtime):
        """
        Availability = (Planned Production Time - Downtime) / Planned Production Time
        
        Args:
            planned_time (float): Planned production time in minutes
            downtime (float): Downtime in minutes
            
        Returns:
            float: Availability as a decimal (0.0 to 1.0)
        """
        if planned_time == 0:
            return 0.0
        return (planned_time - downtime) / planned_time
    
    @staticmethod
    def calculate_performance(cycle_time, total_pieces, available_time):
        """
        Performance = (Ideal Cycle Time × Total Pieces) / (Available Time × 60)
        
        Args:
            cycle_time (float): Ideal cycle time in seconds
            total_pieces (int): Total pieces produced
            available_time (float): Available production time in minutes
            
        Returns:
            float: Performance as a decimal (0.0 to 1.0+)
        """
        if available_time == 0:
            return 0.0
        
        available_time_seconds = available_time * 60
        if available_time_seconds == 0:
            return 0.0
            
        return (cycle_time * total_pieces) / available_time_seconds
    
    @staticmethod
    def calculate_quality(good_pieces, total_pieces):
        """
        Quality = Good Pieces / Total Pieces
        OR
        Quality = 100% - Rejection %
        
        Args:
            good_pieces (int): Number of good/accepted pieces
            total_pieces (int): Total pieces produced
            
        Returns:
            float: Quality as a decimal (0.0 to 1.0)
        """
        if total_pieces == 0:
            return 1.0  # No production means no defects
        return good_pieces / total_pieces
    
    @staticmethod
    def calculate_quality_from_rejection(rejection_percentage):
        """
        Quality = 100% - Rejection %
        
        Args:
            rejection_percentage (float): Rejection percentage (0 to 100)
            
        Returns:
            float: Quality as a decimal (0.0 to 1.0)
        """
        return (100.0 - rejection_percentage) / 100.0
    
    @staticmethod
    def calculate_oee(availability, performance, quality):
        """
        OEE = Availability × Performance × Quality × 100
        
        Args:
            availability (float): Availability as decimal (0.0 to 1.0)
            performance (float): Performance as decimal (0.0 to 1.0+)
            quality (float): Quality as decimal (0.0 to 1.0)
            
        Returns:
            float: OEE as percentage (0.0 to 100.0)
        """
        return availability * performance * quality * 100.0
    
    @staticmethod
    def calculate_cycle_time(planned_time_minutes, target_quantity):
        """
        Cycle Time = (Planned Production Time × 60) / Target Quantity
        
        Args:
            planned_time_minutes (float): Planned production time in minutes
            target_quantity (int): Target quantity to produce
            
        Returns:
            float: Ideal cycle time in seconds per piece
        """
        if target_quantity == 0:
            return 0.0
        return (planned_time_minutes * 60.0) / target_quantity
