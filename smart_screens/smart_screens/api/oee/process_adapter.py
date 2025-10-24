"""
Process Adapter Base Class
All process-specific adapters must implement this interface
"""

from abc import ABC, abstractmethod

class ProcessAdapter(ABC):
    """Base class for all process-specific OEE data adapters"""
    
    def __init__(self):
        self.process_name = self.__class__.__name__.replace('Adapter', '')
    
    @abstractmethod
    def get_production_data(self, from_date, to_date, filters=None):
        """
        Fetch production data for this process
        
        Args:
            from_date (str): Start date (YYYY-MM-DD)
            to_date (str): End date (YYYY-MM-DD)
            filters (dict): Additional filters (shift, machine, lot, etc.)
            
        Returns:
            list: List of production entry dictionaries
        """
        pass
    
    @abstractmethod
    def get_planned_time(self, production_entry):
        """
        Extract planned production time in minutes
        
        Args:
            production_entry (dict): Production entry data
            
        Returns:
            float: Planned time in minutes
        """
        pass
    
    @abstractmethod
    def get_downtime(self, production_entry):
        """
        Extract downtime in minutes
        
        Args:
            production_entry (dict): Production entry data
            
        Returns:
            float: Downtime in minutes
        """
        pass
    
    @abstractmethod
    def get_target_quantity(self, production_entry):
        """
        Extract target/planned quantity
        
        Args:
            production_entry (dict): Production entry data
            
        Returns:
            int: Target quantity
        """
        pass
    
    @abstractmethod
    def get_actual_quantity(self, production_entry):
        """
        Extract actual produced quantity
        
        Args:
            production_entry (dict): Production entry data
            
        Returns:
            int: Actual quantity produced
        """
        pass
    
    @abstractmethod
    def get_quality_data(self, production_entry):
        """
        Fetch quality/inspection data
        
        Args:
            production_entry (dict): Production entry data
            
        Returns:
            dict: {'good_pieces': int, 'total_pieces': int, 'rejection_percentage': float}
        """
        pass
    
    @abstractmethod
    def calculate_cycle_time(self, production_entry):
        """
        Calculate ideal cycle time for this process in seconds
        
        Args:
            production_entry (dict): Production entry data
            
        Returns:
            float: Cycle time in seconds
        """
        pass
    
    @abstractmethod
    def get_lot_number(self, production_entry):
        """
        Extract lot number from production entry
        
        Args:
            production_entry (dict): Production entry data
            
        Returns:
            str: Lot number
        """
        pass
    
    @abstractmethod
    def get_machine_reference(self, production_entry):
        """
        Extract machine/equipment reference
        
        Args:
            production_entry (dict): Production entry data
            
        Returns:
            str: Machine reference
        """
        pass
    
    @abstractmethod
    def get_item_code(self, production_entry):
        """
        Extract item/product code
        
        Args:
            production_entry (dict): Production entry data
            
        Returns:
            str: Item code
        """
        pass
